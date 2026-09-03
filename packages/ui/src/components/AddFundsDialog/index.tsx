'use client';

import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { Button } from '../ui/button';
import { CopyButton } from '../CopyButton';
import { QrCode } from './QrCode';
import { ChainStack } from './ChainStack';
import { useChainIconURI } from '../../hooks';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { eip681Uri } from '../../utils/eip681';
import type { AddFundsDialogProps } from './types';

/**
 * The Add Funds screen: where to send funds, and on which chains.
 *
 * Receive-only by design. There is no fiat rail, no third-party frame, and
 * nothing here reads a balance — the money usually arrives after the user has
 * closed this and gone to an exchange, so a "waiting" state would mostly be
 * wrong. Closing is the normal finish, which is why the only action is Done.
 */
export const AddFundsDialog = ({
  open,
  onOpenChange,
  address,
  chainId,
  asset,
  mainnetRpcUrl,
  apiKey,
  appName,
  appLogoUrl,
  origin,
  onDone,
}: AddFundsDialogProps) => {
  const activeChain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  const chainName = activeChain?.name ?? `Chain ${chainId}`;
  const chainIcon = useChainIconURI(chainId, apiKey, 24);

  // The address renders immediately and the name replaces it if it resolves.
  // Never gated on resolution: a slow or failing lookup must not hold up the
  // one thing the user came here for.
  const { name, avatar } = useReverseIdentity(address, chainId, mainnetRpcUrl);

  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} onClose={onDone}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-none px-6 pt-6">
          <DialogAppHeader
            appName={appName}
            appLogoUrl={appLogoUrl}
            origin={origin ?? ''}
            chainName={chainName}
            chainIcon={chainIcon}
          />

          {/* "Receive on" + the chains the address works on. The stack sits on
              the same line as the words it completes, so it reads as one
              sentence rather than a control the user should operate. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h2 className="text-foreground text-title">Receive on</h2>
            <ChainStack activeChainId={chainId} apiKey={apiKey} />
          </div>

          {/* No chain named in words: the stack above already shows where the
              address works, and naming one in prose only invites the two to
              disagree. */}
          <p className="text-muted-foreground text-body-xs mt-2 leading-normal">
            {asset
              ? `Send ${asset} to this address. Anything else you send still arrives, but this app is asking for ${asset}.`
              : 'Send any supported asset to this address.'}
          </p>
        </div>

        <div className="jaw-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col items-center gap-4">
            {/* Actually white, with actually dark modules, in both themes.
                `bg-background` + `text-foreground` inverted the code in dark
                mode (light modules on a dark plate), which is out of spec: the
                format expects dark on light and plenty of scanners refuse the
                inverse. `text-black` sets the currentColor the modules paint
                with, so the code stays standard whatever the surface does. */}
            <div className="rounded-card border-border border bg-white p-4 text-black">
              {/* Solid code, nothing in the middle. `renderCenter` exists for
                  when a routing address gives the centre something to say; until
                  then the modules stay whole rather than clearing space for a
                  logo that repeats what the stack above already shows. */}
              <QrCode value={eip681Uri(address, chainId)} size={196} label={`QR code to receive on ${chainName}`} />
            </div>

            <div className="flex w-full flex-col items-center gap-1">
              {/* The ENS name when we have one, above the address it stands
                  for. The address stays visible either way: a sender pasting
                  into an exchange needs it, and it is what makes the name
                  checkable. */}
              {name && (
                <p className="text-foreground text-value flex min-w-0 items-center gap-1.5">
                  {avatar && <img src={avatar} alt="" className="size-blob-sm rounded-full" width={16} height={16} />}
                  <span className="truncate">{name}</span>
                </p>
              )}
              {/* The full address, not a truncated one. Truncation is fine
                  where an address only identifies an account, but here the user
                  is checking what they are about to send money to, and a
                  middle-elided address hides exactly where an attacker would
                  differ. Mono so the characters line up for that check. */}
              <p className="text-muted-foreground text-body-xs flex min-w-0 items-start gap-1.5 font-mono">
                <span className="select-all break-all text-center">{address}</span>
                <CopyButton value={address} size={13} className="mt-0.5 flex-none" label="Copy address" />
              </p>
            </div>
          </div>
        </div>

        <div className="border-border/40 flex-none border-t px-6 pb-5 pt-3">
          <Button onClick={onDone} className="rounded-box text-button h-10 w-full font-semibold focus-visible:ring-1">
            Done
          </Button>
        </div>
      </div>
    </ShellDialog>
  );
};

export * from './types';
