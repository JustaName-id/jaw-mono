'use client';

import type { LogEntry } from '../execution-log';

export interface DerivedResponse {
  ok: boolean;
  body: string;
  /** Milliseconds between the matching request log and this result, if known. */
  ms?: number;
}

function formatData(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    // BigInt-safe: wagmi results can carry bigints, which JSON.stringify rejects.
    return JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  } catch {
    return String(data);
  }
}

/** Latest response/error the page's existing log state holds for one method. */
export function latestResponse(logs: LogEntry[], method: string): DerivedResponse | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const entry = logs[i];
    if (!entry || entry.method !== method) continue;
    if (entry.type !== 'response' && entry.type !== 'error') continue;
    let ms: number | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const prev = logs[j];
      if (prev && prev.method === method && prev.type === 'request') {
        ms = entry.timestamp.getTime() - prev.timestamp.getTime();
        break;
      }
    }
    return { ok: entry.type === 'response', body: formatData(entry.data), ms };
  }
  return null;
}

export function ResponsePanel({ response, running = false }: { response: DerivedResponse | null; running?: boolean }) {
  const meta = running
    ? 'Executing…'
    : response
      ? response.ok
        ? `OK${response.ms !== undefined ? ` · ${response.ms}ms` : ''}`
        : `Error${response.ms !== undefined ? ` · ${response.ms}ms` : ''}`
      : 'Idle';
  const metaInk = running
    ? 'text-shell-warn'
    : response
      ? response.ok
        ? 'text-shell-ok'
        : 'text-shell-err'
      : 'text-shell-ink-3';
  const bodyInk = running || !response ? 'text-shell-ink-4' : response.ok ? 'text-shell-code-ink' : 'text-shell-err';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-shell-ink-2 text-[13.5px] font-medium tracking-[-0.005em]">Response</span>
        <span className={`text-[13px] ${metaInk}`}>{meta}</span>
      </div>
      <div className="border-shell-line bg-shell-code min-h-[120px] rounded-[14px] border px-[22px] py-5">
        <pre className={`m-0 whitespace-pre-wrap break-words font-mono text-sm leading-[1.7] ${bodyInk}`}>
          {running ? 'Executing…' : (response?.body ?? 'Awaiting execution.')}
        </pre>
      </div>
    </div>
  );
}
