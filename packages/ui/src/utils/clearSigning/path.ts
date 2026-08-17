// ============================================================================
//  Path resolution
// ----------------------------------------------------------------------------
// ERC-7730 path roots:
//   `@.X`  → transaction envelope (from, to, value, chainId, …)
//   `#.X`  → function arguments
//   `X`    → function arguments (implicit, same as `#.X`)
//   `$.X`  → descriptor-internal ($ref) — resolved upstream in mergeField, not here.
//
// Segment syntax:
//   `a.b.c`    → nested object access
//   `[n]`      → array indexing (negative from end)
//   `[]`       → iterate all elements
//   `[a:b]`    → byte slice on a `bytes`/hex value
// ============================================================================

import type { PathContext } from './types';

const SLICE_RE = /^\[(-?\d+):(-?\d+)?\]$/;
const INDEX_RE = /^\[(-?\d+)\]$/;
const ITER_RE = /^\[\]$/;

function splitPath(path: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') {
      if (buf) {
        out.push(buf);
        buf = '';
      }
    } else if (ch === '[') {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      const end = path.indexOf(']', i);
      if (end === -1) {
        buf += path.slice(i);
        i = path.length;
      } else {
        out.push(path.slice(i, end + 1));
        i = end;
      }
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function sliceBytes(hex: string, start: number, end?: number): string {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const byteLen = stripped.length / 2;
  const s = start < 0 ? Math.max(0, byteLen + start) : Math.min(start, byteLen);
  const e = end === undefined ? byteLen : end < 0 ? Math.max(0, byteLen + end) : Math.min(end, byteLen);
  return '0x' + stripped.slice(s * 2, e * 2);
}

export function resolvePath(path: string, ctx: PathContext): unknown {
  if (!path) return undefined;

  let clean = path;
  let current: unknown = ctx.args;
  if (path.startsWith('@.')) {
    current = ctx.tx;
    clean = path.slice(2);
  } else if (path.startsWith('#.')) {
    current = ctx.args;
    clean = path.slice(2);
  }

  for (const seg of splitPath(clean)) {
    if (current === undefined || current === null) return undefined;

    if (ITER_RE.test(seg)) {
      return Array.isArray(current) ? current : undefined;
    }

    const idxMatch = seg.match(INDEX_RE);
    if (idxMatch) {
      if (!Array.isArray(current)) return undefined;
      const idx = Number(idxMatch[1]);
      current = current[idx < 0 ? current.length + idx : idx];
      continue;
    }

    const sliceMatch = seg.match(SLICE_RE);
    if (sliceMatch) {
      const start = Number(sliceMatch[1]);
      const end = sliceMatch[2] !== undefined ? Number(sliceMatch[2]) : undefined;
      if (typeof current === 'string' && current.startsWith('0x')) {
        current = sliceBytes(current, start, end);
        continue;
      }
      if (Array.isArray(current)) {
        current = current.slice(start, end);
        continue;
      }
      return undefined;
    }

    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }

  return current;
}
