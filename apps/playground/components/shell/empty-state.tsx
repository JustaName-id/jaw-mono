'use client';

import Image from 'next/image';
import { CopyChip } from './primitives';

/** Main-pane state when nothing is selected and no session exists yet. */
export function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="flex max-w-[440px] flex-col items-center text-center">
        <span className="border-shell-line bg-shell-raise flex h-16 w-16 items-center justify-center rounded-full border">
          <Image src="/jaw-logo.png" alt="" width={26} height={28} className="block dark:brightness-0 dark:invert" />
        </span>
        <h2 className="mt-5 text-[26px] font-medium leading-tight tracking-[-0.035em]">
          Connect <span className="font-light italic tracking-[-0.005em]">to get started</span>
        </h2>
        <p className="text-shell-ink-3 mt-3 text-[14.5px] leading-relaxed">
          Authenticate with your passkey to run methods against a live smart account. No seed phrase, no custodian.
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="bg-shell-btn text-shell-btn-ink mt-6 inline-flex min-h-[46px] cursor-pointer items-center gap-[9px] rounded-full border-0 px-6 py-3 text-[15px] font-medium tracking-[-0.005em]"
        >
          Connect
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h13" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
        <p className="text-shell-ink-4 mt-4 text-[13px] leading-relaxed">
          Silent methods and code snippets work without a session — pick one from the sidebar.
        </p>
      </div>
    </div>
  );
}

/** Main-pane state when connected but no method is selected yet. */
export function ConnectedIdle({
  address,
  ensName,
  chainId,
}: {
  address?: string;
  ensName?: string | null;
  chainId?: string | number;
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="flex max-w-[440px] flex-col items-center text-center">
        <span className="border-shell-line bg-shell-raise flex h-16 w-16 items-center justify-center rounded-full border">
          <span className="animate-pulse-dot bg-shell-ok h-2.5 w-2.5 rounded-full" />
        </span>
        <h2 className="mt-5 text-[26px] font-medium leading-tight tracking-[-0.035em]">
          Pick <span className="font-light italic tracking-[-0.005em]">a method</span>
        </h2>
        <p className="text-shell-ink-3 mt-3 text-[14.5px] leading-relaxed">
          Your session is live. Select a method from the sidebar to inspect it, fill in parameters, and execute.
        </p>
        {(ensName || address || chainId !== undefined) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {(ensName || address) && (
              <CopyChip
                text={ensName ?? address ?? ''}
                display={ensName ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '')}
              />
            )}
            {chainId !== undefined && <CopyChip text={String(chainId)} />}
          </div>
        )}
      </div>
    </div>
  );
}
