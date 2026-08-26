'use client';

import Link from 'next/link';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { SegGroup, segClass } from './primitives';
import type { ShellSdk } from './header';

export interface ConfigCardProps {
  sdk: ShellSdk;
  /** The session's live chain, as the page tracks it (hex or decimal). */
  chainId: string | number;
  mode: 'cross-platform' | 'app-specific';
  transport: 'iframe' | 'popup';
}

/** "Base Sepolia · 84532", or the bare id for a chain the SDK doesn't list. */
function chainLabel(chainId: string | number): string {
  // Number() reads both forms the pages hold: '0x14a34' and 84532.
  const chain = SUPPORTED_CHAINS.find((c) => c.id === Number(chainId));
  return chain ? `${chain.name} · ${chain.id}` : String(chainId);
}

function RowLabel({ children }: { children: string }) {
  return (
    <span className="text-shell-ink-4 flex-none font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
      {children}
    </span>
  );
}

/**
 * Compact session config: the live chain, and the Mode / Transport switches.
 * Mode and Transport are links because that is exactly how the pages have
 * always worked — the query params drive connector rebuilds.
 *
 * The chain is REPORTED, not set: switching chains is `wallet_switchEthereumChain`
 * in the method list, and the page picks the result up from the provider's
 * `chainChanged`. A select here would have to either dispatch that method or
 * silently disagree with it.
 */
export function ConfigCard({ sdk, chainId, mode, transport }: ConfigCardProps) {
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
        <RowLabel>Chain</RowLabel>
        <span className="border-shell-line-2 text-shell-ink max-w-[170px] truncate rounded-full border px-[11px] py-[5px] text-xs tracking-[-0.005em]">
          {chainLabel(chainId)}
        </span>
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
