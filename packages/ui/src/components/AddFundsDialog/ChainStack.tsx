'use client';

import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { ChainIcon } from './ChainIcon';

/**
 * Icons shown before the rest collapse into a "+N".
 *
 * High enough to stack every mainnet we support today (15), because a "+10"
 * next to five icons is a count rather than information — the whole point of
 * the stack is showing the set. The cap stays as a guard: it only engages if the
 * supported list grows past what fits, at which point this needs a rethink
 * rather than a wider row.
 */
const MAX_SHOWN = 16;

/** Overlap step in px. Half an icon reads as a stack; tighter than that reads as a smear. */
const STEP = 10;

export interface ChainStackProps {
  /** Chain ids the address works on, from the request. */
  chains: number[];
  /** The chain the QR pins, drawn first and unfaded. */
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
 * The active chain leads, because that is the one the QR encodes and the only
 * one the sender has to get right.
 */
export function ChainStack({ chains, activeChainId, apiKey }: ChainStackProps) {
  const ordered = [activeChainId, ...chains.filter((id) => id !== activeChainId)].filter((id) => chains.includes(id));
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
          // Overlap by half an icon. The ring is the surface colour, so each
          // icon reads as separate from the one behind it in both themes.
          className="ring-popover relative inline-flex rounded-full ring-2"
          style={{ marginLeft: i === 0 ? 0 : -(20 - STEP), zIndex: shown.length - i }}
        >
          <ChainIcon chainId={id} apiKey={apiKey} size={20} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="ring-popover bg-secondary text-muted-foreground text-label relative inline-flex h-5 items-center justify-center rounded-full px-1.5 font-mono ring-2"
          style={{ marginLeft: -(20 - STEP) }}
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
