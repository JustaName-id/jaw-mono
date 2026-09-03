'use client';

import { useMemo } from 'react';
import { MAINNET_CHAINS, SUPPORTED_CHAINS } from '@jaw.id/core';
import { ChainIcon } from './ChainIcon';

/**
 * Icons shown before the rest collapse into a "+N".
 *
 * High enough to stack every mainnet we support today, because a "+10" beside
 * five icons is a count rather than information, and showing the set is the
 * whole point. The cap stays as a guard: if the supported list outgrows the row
 * this needs a rethink, not a wider row.
 */
const MAX_SHOWN = 16;

/**
 * Icon size and the step between them, in px.
 *
 * A 10px step on a 20px icon hid half of every logo and the row read as a smear
 * of crescents. 14 leaves most of each logo visible while still overlapping
 * enough to read as one stack rather than a list.
 */
const ICON = 20;
const STEP = 14;

export interface ChainStackProps {
  /** The chain the QR pins. Leads the stack, and is included even if it is a testnet. */
  activeChainId: number;
  apiKey?: string;
}

/**
 * The overlapping chain icons beside "Receive on".
 *
 * Informational, not a control: a smart account has the same address on every
 * chain, so this says where the address works rather than offering a choice.
 * Making it a picker would imply the address changes with the selection.
 *
 * The list is derived here rather than passed in. It is a display decision, not
 * a fact about the request, so nothing needs to travel through the signer and
 * the two hosts cannot drift apart — the CrossPlatform popup only ever learns
 * one chain, so anything plumbed through produced a stack of one there.
 */
export function ChainStack({ activeChainId, apiKey }: ChainStackProps) {
  const ordered = useMemo(() => {
    const mainnets = MAINNET_CHAINS.map((c) => c.id);

    // Mainnets only. A testnet means nothing to someone about to send real
    // funds, and adding the active one when it is a testnet drew the same logo
    // twice: a testnet shares its mainnet's icon, so Base Sepolia beside Base
    // read as a duplicate rather than as two networks.
    if (mainnets.includes(activeChainId)) {
      return [activeChainId, ...mainnets.filter((id) => id !== activeChainId)];
    }
    return mainnets;
  }, [activeChainId]);

  const shown = ordered.slice(0, MAX_SHOWN);
  const overflow = ordered.length - shown.length;

  if (ordered.length === 0) return null;

  return (
    // The list carries the full names so a screen reader gets "Base, Optimism"
    // rather than a run of unlabelled images.
    <span className="flex items-center" aria-label={`Works on ${ordered.map(chainName).join(', ')}`} role="img">
      {shown.map((id, i) => (
        <span
          key={id}
          // The ring is the surface colour, so each icon reads as separate from
          // the one behind it in both themes.
          className="ring-popover relative inline-flex rounded-full ring-2"
          style={{ marginLeft: i === 0 ? 0 : -(ICON - STEP), zIndex: shown.length - i }}
        >
          <ChainIcon chainId={id} apiKey={apiKey} size={ICON} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="ring-popover bg-secondary text-muted-foreground text-label relative inline-flex h-5 items-center justify-center rounded-full px-1.5 font-mono ring-2"
          style={{ marginLeft: -(ICON - STEP) }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

/** A chain's display name, falling back to the id for one we don't carry. */
function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
}
