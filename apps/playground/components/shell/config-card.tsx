'use client';

import Link from 'next/link';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { SegGroup, segClass } from './primitives';
import type { ShellSdk } from './header';

export interface ConfigCardProps {
  sdk: ShellSdk;
  /** Decimal chain id shown in the "Default chain" select (display/prefill only). */
  chainValue: string;
  onChainChange: (chainId: string) => void;
  mode: 'cross-platform' | 'app-specific';
  transport: 'iframe' | 'popup';
}

function RowLabel({ children }: { children: string }) {
  return (
    <span className="text-shell-ink-4 flex-none font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

/**
 * Compact session config: default chain (UI preference), and the Mode /
 * Transport switches. Mode and Transport are links because that is exactly how
 * the pages have always worked — the query params drive connector rebuilds.
 */
export function ConfigCard({ sdk, chainValue, onChainChange, mode, transport }: ConfigCardProps) {
  const base = sdk === 'core' ? '/core' : '/wagmi';
  const href = (next: { mode?: 'app-specific'; transport?: 'popup' }) => {
    const params = new URLSearchParams();
    const effMode = 'mode' in next ? next.mode : mode === 'app-specific' ? 'app-specific' : undefined;
    const effTransport = 'transport' in next ? next.transport : transport === 'popup' ? 'popup' : undefined;
    if (effMode) params.set('mode', effMode);
    if (effTransport) params.set('transport', effTransport);
    const q = params.toString();
    return q ? `${base}?${q}` : base;
  };
  const compactSeg = (active: boolean) => segClass(active, 'px-2.5 py-[5px] text-[11.5px]');

  return (
    <div className="border-shell-line bg-shell-raise mx-3.5 mb-3.5 mt-0.5 flex flex-col gap-[7px] overflow-visible rounded-[14px] border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <RowLabel>Default chain</RowLabel>
        <div className="relative flex items-center">
          <select
            aria-label="Default chain"
            value={chainValue}
            onChange={(e) => onChainChange(e.target.value)}
            className="border-shell-line-2 bg-shell-raise text-shell-ink max-w-[170px] cursor-pointer appearance-none rounded-full border py-[5px] pl-[11px] pr-[27px] text-xs tracking-[-0.005em] outline-none"
          >
            {SUPPORTED_CHAINS.map((chain) => (
              <option key={chain.id} value={String(chain.id)} className="bg-shell-pop text-shell-ink">
                {chain.name} · {chain.id}
              </option>
            ))}
          </select>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-shell-ink-3 pointer-events-none absolute right-[9px]"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <RowLabel>Mode</RowLabel>
        <SegGroup label="Mode">
          <Link href={href({ mode: undefined })} className={compactSeg(mode === 'cross-platform')}>
            Cross-Platform
          </Link>
          <Link href={href({ mode: 'app-specific' })} className={compactSeg(mode === 'app-specific')}>
            App-Specific
          </Link>
        </SegGroup>
      </div>

      {mode === 'cross-platform' && (
        <div className="flex items-center justify-between gap-2">
          <RowLabel>Transport</RowLabel>
          <SegGroup label="Transport">
            <Link href={href({ transport: undefined })} className={compactSeg(transport !== 'popup')}>
              Iframe (default)
            </Link>
            <Link href={href({ transport: 'popup' })} className={compactSeg(transport === 'popup')}>
              Popup
            </Link>
          </SegGroup>
        </div>
      )}
    </div>
  );
}
