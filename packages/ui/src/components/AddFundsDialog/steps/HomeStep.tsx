'use client';

import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Receive } from '../Receive';
import { PayButton } from '../PayButton';
import { Section, StepLayout } from '../primitives';
import type { AddFundsChain } from '../types';

/** Landing view: pick a network, receive via QR, or start a buy (when available). */
export function HomeStep({
  chains,
  selectedChainId,
  onSelectChain,
  chainName,
  destinationAddress,
  ensName,
  canBuyOnChain,
  onBuy,
  onDone,
}: {
  chains: AddFundsChain[];
  selectedChainId: number;
  onSelectChain: (id: number) => void;
  chainName: string;
  destinationAddress: string;
  ensName: string | null;
  canBuyOnChain: boolean;
  onBuy: () => void;
  onDone: () => void;
}) {
  return (
    <StepLayout
      footer={
        <Button type="button" variant="outline" className="w-full" onClick={onDone}>
          Done
        </Button>
      }
    >
      <Section title="Network" className="gap-1.5">
        <Select value={String(selectedChainId)} onValueChange={(v) => onSelectChain(Number(v))}>
          <SelectTrigger>
            <SelectValue placeholder={chainName} />
          </SelectTrigger>
          <SelectContent>
            {chains.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Receive address={destinationAddress} chainName={chainName} ensName={ensName} />

      {/* Buy CTA below receive — only when the chain has an onramp-supported token */}
      {canBuyOnChain && (
        <Section title={`Or buy on ${chainName}`} className="gap-2.5">
          <PayButton onClick={onBuy} />
        </Section>
      )}
    </StepLayout>
  );
}
