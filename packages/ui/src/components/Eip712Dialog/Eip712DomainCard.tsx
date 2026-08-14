'use client';

import { ReactNode } from 'react';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { useChainIconURI } from '../../hooks';
import { CopyButton } from '../CopyButton';
import { formatAddress } from '../../utils/formatAddress';
import { sanitizeDisplayName } from '../../utils/sanitize';

/**
 * The EIP-712 domain the signature is bound to: the verifying contract (which
 * contract will accept the signature) and the network. Security-critical — a
 * spoofed `verifyingContract` is otherwise indistinguishable from the real one.
 *
 * The network is resolved from the message's own `domain.chainId` (passed as
 * `chainId`), NOT the wallet's connected chain: a signature is valid on the chain
 * its domain names, which can differ from where the wallet currently sits.
 */
export function Eip712DomainCard({
  domainName,
  verifyingContract,
  chainId,
  apiKey,
}: {
  domainName?: string;
  verifyingContract?: string;
  chainId?: number;
  apiKey?: string;
}) {
  const safeName = sanitizeDisplayName(domainName ?? '');
  // Hook must run unconditionally; 16px matches the row (avoids the 24px default's min-width).
  const chainIcon = useChainIconURI(chainId ?? 0, apiKey, 16);
  // Show the given chainId (ground truth) plus a friendly name when we recognise it.
  const knownChain = chainId ? SUPPORTED_CHAINS.find((c) => c.id === chainId) : undefined;
  const networkLabel = chainId ? (knownChain ? `${knownChain.name} · ${chainId}` : `Chain ${chainId}`) : undefined;

  if (!verifyingContract && !networkLabel && !safeName) return null;

  return (
    <div className="border-border rounded-box border p-3">
      <div className="divide-border/40 flex flex-col divide-y">
        {safeName && (
          <Row label="Domain">
            <span className="text-foreground text-body-sm truncate font-mono">{safeName}</span>
          </Row>
        )}
        {verifyingContract && (
          <Row label="Verifying contract">
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <span className="text-foreground text-body-sm truncate font-mono">
                {formatAddress(verifyingContract)}
              </span>
              <CopyButton value={verifyingContract} size={14} resetAfterMs={1500} label="Copy address" />
            </div>
          </Row>
        )}
        {networkLabel && (
          <Row label="Network">
            <div className="flex min-w-0 items-center justify-end gap-1.5">
              <span className="flex-none">{chainIcon}</span>
              <span className="text-foreground text-body-sm truncate font-mono">{networkLabel}</span>
            </div>
          </Row>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="text-muted-foreground text-body-sm flex-none font-medium">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}
