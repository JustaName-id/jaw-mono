'use client';

// ============================================================================
// ERC-8213 — Verification digest UI
// ----------------------------------------------------------------------------
// Display-only components that surface the reproducible cryptographic
// fingerprints from utils/erc8213.ts so a signer can independently recompute
// and verify what they are signing. Purely additive — these never touch the
// signing path. Sits alongside the ERC-7730 clear-signing view (which gives the
// human-readable description); the digests are an extra verification surface.
// ============================================================================

import { computeEip712Digests } from '../../utils/erc8213';
import { CopyButton } from '../CopyButton';

/** A single labeled, monospace, 0x-prefixed hash value with copy-to-clipboard. */
export const DigestRow = ({
  label,
  value,
  prominent = false,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) => {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center justify-between gap-2">
        <p className={`text-foreground text-xs leading-[133%] ${prominent ? 'font-bold' : 'font-semibold'}`}>{label}</p>
        <CopyButton value={value} size={16} resetAfterMs={1500} label={`Copy ${label}`} />
      </div>
      <div className="bg-secondary rounded-[6px] p-2">
        <p className="text-foreground break-all font-mono text-xs leading-[150%]">{value}</p>
      </div>
    </div>
  );
};

/**
 * ERC-8213 verification digests for an EIP-712 signature, collapsed behind a
 * disclosure. Expanded, the EIP-712 Digest is shown prominently (the one hash
 * the signer verifies) above the secondary Domain and Message hashes.
 *
 * Renders nothing if the typed data can't be parsed — the dialog already shows
 * its own "Failed to parse typed data" message in that case.
 */
export const Eip712VerificationDigests = ({ typedDataJson }: { typedDataJson: string }) => {
  let digests: ReturnType<typeof computeEip712Digests>;
  try {
    digests = computeEip712Digests(typedDataJson);
  } catch {
    return null;
  }

  return (
    <details className="border-border group overflow-hidden rounded-[8.5px] border text-xs [&_summary::-webkit-details-marker]:hidden">
      <summary className="hover:bg-foreground/[0.03] flex cursor-pointer list-none items-center justify-between px-3 py-2">
        <span className="text-muted-foreground text-[11px] font-medium">Digests data</span>
        <svg
          className="text-muted-foreground h-3 w-3 transition-transform group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="border-border flex flex-col gap-2.5 border-t p-3">
        <DigestRow label="Domain Hash" value={digests.domainHash} />
        <DigestRow label="Message Hash" value={digests.messageHash} />
        <DigestRow label="EIP-712 Digest" value={digests.eip712Digest} prominent />
      </div>
    </details>
  );
};
