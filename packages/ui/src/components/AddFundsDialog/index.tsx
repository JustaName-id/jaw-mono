'use client';

import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { Button } from '../ui/button';
import { CopyButton } from '../CopyButton';
import { QrCode } from './QrCode';
import { ChainStack } from './ChainStack';
import { ChainIcon } from './ChainIcon';
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
  chains,
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
            <ChainStack chains={chains} activeChainId={chainId} apiKey={apiKey} />
          </div>

          {/* No chain named in words: the stack above shows where the address
              works, and the icon inside the QR shows which chain that code is
              for. Naming one in prose only invites a mismatch between the three
              of them. */}
          <p className="text-muted-foreground text-body-xs mt-2 leading-normal">
            {asset
              ? `Send ${asset} to this address. Anything else you send still arrives, but this app is asking for ${asset}.`
              : 'Send any supported asset to this address.'}
          </p>
        </div>

        <div className="jaw-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="flex flex-col items-center gap-4">
            {/* White plate under the code regardless of theme. A scanner reads
                contrast, and the modules are drawn in the foreground colour, so
                the plate is what keeps a dark-mode code readable. */}
            <div className="rounded-card border-border bg-background border p-4">
              <QrCode
                value={eip681Uri(address, chainId)}
                size={196}
                label={`QR code to receive on ${chainName}`}
                // The chain in the middle of the code it is encoded into. The
                // payload already carries the chain for scanners; this is the
                // same fact for the person holding the phone, at the moment
                // they are deciding whether to scan.
                renderCenter={(px) => (
                  <span
                    className="bg-background flex items-center justify-center rounded-full"
                    style={{ width: px, height: px }}
                  >
                    <ChainIcon chainId={chainId} apiKey={apiKey} size={Math.round(px * 0.88)} />
                  </span>
                )}
              />
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
