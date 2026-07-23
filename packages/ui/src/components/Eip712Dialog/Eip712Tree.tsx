'use client';

import { useMemo, useState } from 'react';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { CopyIcon, CopiedIcon } from '../../icons';

// EIP-712 TypedData structure (mirrors the dialog's local type).
interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

type TreeNode = {
  id: string;
  depth: number;
  label: string;
  kind: 'leaf' | 'group';
  badge?: string; // solidity type (leaves)
  value?: string; // formatted, truncated value (leaves)
  copyValue?: string; // full untruncated value to copy (address/bytes leaves)
  children?: TreeNode[];
};

const INDENT = 14; // px per depth level
const MAX_DEPTH = 12;

const isArrayType = (type: string) => /\[\d*\]$/.test(type);
const baseType = (type: string) => type.replace(/\[\d*\]$/, '');

// Plausible unix-timestamp window (2000-01-01 .. 2100-01-01) for date detection.
const TS_MIN = 946684800n;
const TS_MAX = 4102444800n;

/** Largest value a `uint<bits>` can hold — used to spot "unlimited"/"no expiry" sentinels. */
function maxUint(type: string): bigint | null {
  const m = /^uint(\d*)$/.exec(type);
  if (!m) return null;
  const bits = m[1] ? Number(m[1]) : 256;
  return (1n << BigInt(bits)) - 1n;
}

/** Thousands-separate a decimal integer string. */
function groupDigits(s: string): string {
  const neg = s.startsWith('-');
  const digits = neg ? s.slice(1) : s;
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(seconds: bigint): string {
  const d = new Date(Number(seconds) * 1000);
  if (Number.isNaN(d.getTime())) return groupDigits(seconds.toString());
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Network name for a chainId, e.g. "Ethereum · 1"; bare id when unrecognised. */
function networkLabel(id: number): string {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === id);
  return chain ? `${chain.name} · ${id}` : String(id);
}

/**
 * Format a primitive leaf by its solidity type AND field name. The field name
 * lets us render the *meaning* rather than the raw integer: `deadline`→date,
 * `chainId`→network, amount-like→grouped ("Unlimited" at max-uint). We never
 * apply token decimals here (unknown in the raw fallback) — that's clear-signing's
 * job; integers are grouped, not truncated like a hash.
 */
function formatValue(type: string, value: unknown, fieldName = ''): string {
  if (value === null || value === undefined) return '—';
  const name = fieldName.toLowerCase();

  if (type === 'address') {
    const v = String(value);
    return v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
  }

  if (/^bytes\d*$/.test(type)) {
    const v = String(value);
    if (v.startsWith('0x')) {
      const byteLen = (v.length - 2) / 2;
      const body = v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
      return `${body} ${byteLen}b`;
    }
    return v;
  }

  if (/^(u?int)\d*$/.test(type)) {
    let big: bigint | null = null;
    try {
      big = BigInt(String(value));
    } catch {
      return String(value);
    }

    if (name === 'chainid' || name.endsWith('chainid')) return networkLabel(Number(big));

    const isTimestamp = /(deadline|expir|validuntil|validafter|validbefore|validto|notbefore|notafter|timestamp)/.test(
      name
    );
    const isAmount = /(amount|value|allowance|limit|balance|price|cost|fee|total|wad)/.test(name);

    const mx = maxUint(type);
    if (mx !== null && big === mx) {
      if (isTimestamp) return 'No expiry';
      if (isAmount) return 'Unlimited';
    }
    if (isTimestamp && big >= TS_MIN && big <= TS_MAX) return formatDate(big);

    return groupDigits(big.toString());
  }

  if (type === 'bool') return String(value);

  const v = String(value);
  return v.length > 80 ? `${v.slice(0, 78)}…` : v;
}

/** Build one node (recursively for structs/arrays) from a type + value. */
function buildNode(
  types: TypedData['types'],
  type: string,
  value: unknown,
  label: string,
  id: string,
  depth: number
): TreeNode {
  if (depth > MAX_DEPTH) {
    return { id, depth, label, kind: 'leaf', badge: type, value: '…' };
  }

  if (isArrayType(type)) {
    const base = baseType(type);
    const arr = Array.isArray(value) ? value : [];
    return {
      id,
      depth,
      label,
      kind: 'group',
      // Generic index labels — never derive from the element's struct type name.
      children: arr.map((el, i) => buildNode(types, base, el, `[${i}]`, `${id}[${i}]`, depth + 1)),
    };
  }

  // Struct
  const fields = types[type];
  if (fields) {
    if (value === null || value === undefined) {
      return { id, depth, label, kind: 'leaf', value: 'None' };
    }
    const obj = value as Record<string, unknown>;
    return {
      id,
      depth,
      label,
      kind: 'group',
      children: fields.map((f) => buildNode(types, f.type, obj?.[f.name], f.name, `${id}.${f.name}`, depth + 1)),
    };
  }

  // Leaf. Keep the full value to copy whenever the display is truncated — addresses,
  // bytes, and any long string/value that formatValue shortened.
  const raw = value == null ? undefined : String(value);
  const copyable = raw != null && (type === 'address' || /^bytes\d*$/.test(type) || raw.length > 60);
  return {
    id,
    depth,
    label,
    kind: 'leaf',
    badge: type,
    value: formatValue(type, value, label),
    copyValue: copyable ? raw : undefined,
  };
}

/** Depth-ordered guide rails behind the row content. */
function Spines({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="bg-foreground/[0.08] absolute bottom-0 top-0 w-px"
          style={{ left: 9 + 3 + i * INDENT }}
        />
      ))}
    </>
  );
}

/** Right-aligned leaf value with an optional copy button (address/bytes). */
function LeafValue({ display, copyValue }: { display?: string; copyValue?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!copyValue || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(copyValue)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <span className="ml-auto flex min-w-0 items-center justify-end gap-1">
      <span className="text-foreground min-w-0 break-all text-right font-mono text-[10px] font-medium">{display}</span>
      {copyValue &&
        (copied ? (
          <CopiedIcon className="size-3 flex-none" />
        ) : (
          <CopyIcon className="size-3 flex-none cursor-pointer" onClick={onCopy} />
        ))}
    </span>
  );
}

const Caret = ({ open }: { open: boolean }) => (
  <svg
    width="9"
    height="9"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-muted-foreground flex-none transition-transform"
    style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/**
 * Decoded EIP-712 tree: walks the primaryType's fields against the message,
 * annotating each with its solidity type and truncating hex/number values.
 * Structs and arrays are collapsible; guide rails mark nesting depth.
 */
export function Eip712Tree({ typedData }: { typedData: TypedData }) {
  const rootNodes = useMemo(() => {
    const fields = typedData.types[typedData.primaryType] ?? [];
    return fields.map((f) => buildNode(typedData.types, f.type, typedData.message?.[f.name], f.name, f.name, 0));
  }, [typedData]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Flatten to the visible rows honoring collapse state.
  const rows: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      rows.push(n);
      if (n.kind === 'group' && n.children && !collapsed.has(n.id)) walk(n.children);
    }
  };
  walk(rootNodes);

  return (
    <div className="border-border overflow-hidden rounded-[10.5px] border">
      <div className="border-border border-b px-[10.5px] py-[7.5px]">
        <span className="text-muted-foreground font-mono text-[9px] font-semibold uppercase tracking-[0.11em]">
          {typedData.primaryType}
        </span>
      </div>
      <div>
        {rows.map((r, i) => {
          const pad = r.depth * INDENT;
          const border = i === 0 ? '' : 'border-foreground/[0.06] border-t';
          if (r.kind === 'group') {
            const open = !collapsed.has(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggle(r.id)}
                className={`hover:bg-foreground/[0.03] relative flex w-full items-center gap-1.5 py-[7.5px] pr-[10.5px] text-left ${border}`}
                style={{ paddingLeft: 9 + pad }}
              >
                <Spines depth={r.depth} />
                <Caret open={open} />
                <span className="text-foreground/90 font-mono text-[9px] font-medium">{r.label}</span>
              </button>
            );
          }
          return (
            <div key={r.id} className={`relative py-[7px] pl-[9px] pr-[10.5px] ${border}`}>
              <Spines depth={r.depth} />
              <div className="flex items-center gap-1.5" style={{ paddingLeft: pad }}>
                <span className="text-muted-foreground flex-none font-mono text-[9px] font-medium">{r.label}</span>
                {r.badge && (
                  <span className="text-muted-foreground/70 bg-foreground/5 flex-none rounded-[4px] px-1 py-px font-mono text-[7px] font-medium">
                    {r.badge}
                  </span>
                )}
                <LeafValue display={r.value} copyValue={r.copyValue} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
