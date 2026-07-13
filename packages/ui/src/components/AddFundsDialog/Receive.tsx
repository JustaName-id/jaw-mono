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

export interface ReceiveProps {
  address: string;
  /** Display name of the currently-selected network. */
  chainName: string;
  /** Reverse-resolved ENS name (name@chain), if any. */
  ensName?: string | null;
}

/**
 * Receive section of the Add Funds screen: the account address as a QR plus a
 * copyable truncated address. Self-contained — no onramp/keys/proxy dependency,
 * so it renders identically in CrossPlatform (keys) and AppSpecific (host UI).
 * The address is the same on every EVM chain; the chain name is guidance.
 */
export function Receive({ address, chainName, ensName }: ReceiveProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
      <p className="text-foreground text-xs font-bold leading-[133%]">Receive on {chainName}</p>
      <div className="flex justify-center">
        <div className="rounded-[6px] bg-white p-3">
          <QrCode value={address} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        {ensName && <p className="text-foreground text-sm font-medium leading-[150%]">{ensName}</p>}
        <button
          type="button"
          onClick={copy}
          className="text-foreground hover:text-muted-foreground flex items-center gap-1.5 font-mono text-xs transition-colors"
          title={address}
        >
          <span className="break-all">{formatAddress(address)}</span>
          {copied ? <CopiedIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
        </button>
      </div>
    </div>
  );
}
