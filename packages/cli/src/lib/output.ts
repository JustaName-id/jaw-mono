import type { OutputFormat } from './types.js';

export function formatOutput(data: unknown, format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(data, replaceBigInt, 2);
  }
  return formatHuman(data);
}

function replaceBigInt(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function formatHuman(data: unknown, indent = 0): string {
  if (data === null || data === undefined) {
    return 'null';
  }

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean' || typeof data === 'bigint') {
    return String(data);
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)';
    return data.map((item, i) => `${i + 1}. ${formatHuman(item, indent + 2)}`).join('\n');
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return '(empty)';
    const pad = ' '.repeat(indent);
    const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
    return entries
      .map(([key, val]) => {
        const paddedKey = key.padEnd(maxKeyLen);
        const valStr = typeof val === 'object' && val !== null ? '\n' + formatHuman(val, indent + 2) : String(val);
        return `${pad}${paddedKey}  ${valStr}`;
      })
      .join('\n');
  }

  return String(data);
}
