'use client';

import { useMemo, useState } from 'react';
import { encode } from 'uqr';
import { formatAddress } from '../../utils';
import { CopyIcon, CopiedIcon } from '../../icons';

// Build the QR as one SVG <path> from uqr's boolean matrix — no
// dangerouslySetInnerHTML, no canvas, no network.
function QrCode({ value }: { value: string }) {
  const { size, path } = useMemo(() => {
    const result = encode(value);
    let d = '';
    for (let y = 0; y < result.size; y++) {
      for (let x = 0; x < result.size; x++) {
        if (result.data[y][x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: result.size, path: d };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-40 w-40 text-black"
      role="img"
      aria-label="Account address QR code"
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

// Click-to-copy text with a trailing copy/copied icon. No border/background —
// just an inline attribute that flips to a check for a beat after copying.
function Copyable({ value, display, className }: { value: string; display: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={value}
      className={`flex items-center gap-1.5 transition-opacity hover:opacity-70 ${className ?? ''}`}
    >
      <span className="break-all">{display}</span>
      {copied ? (
        <CopiedIcon width={13} height={13} className="shrink-0" />
      ) : (
        <CopyIcon width={13} height={13} className="shrink-0 opacity-60" />
      )}
    </button>
  );
}

export interface ReceiveProps {
  address: string;
  /** Display name of the currently-selected network. */
  chainName: string;
  /** Reverse-resolved ENS name (name@chain), if any. */
  ensName?: string | null;
}

/**
 * Receive section of the Add Funds screen: the account address as a QR plus its
 * copyable ENS name (if any) and truncated address. Self-contained — no
 * onramp/keys/proxy dependency, so it renders identically in CrossPlatform
 * (keys) and AppSpecific (host UI). The address is the same on every EVM chain;
 * the chain name is guidance.
 */
export function Receive({ address, chainName, ensName }: ReceiveProps) {
  return (
    <div className="border-border flex flex-col gap-4 rounded-[6px] border p-3.5">
      <p className="text-foreground text-xs font-bold leading-[133%]">Receive on {chainName}</p>
      <div className="flex justify-center">
        <div className="rounded-[10px] bg-white p-3">
          <QrCode value={address} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        {ensName && (
          <Copyable
            value={ensName.split('@')[0]}
            display={ensName}
            className="text-foreground text-sm font-semibold leading-[150%]"
          />
        )}
        <Copyable
          value={address}
          display={formatAddress(address)}
          className="text-muted-foreground font-mono text-xs leading-[150%]"
        />
      </div>
    </div>
  );
}
