'use client';

import { DefaultDialog } from '../DefaultDialog';
import { DialogShell } from '../DialogShell';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountPill } from '../AccountPill';
import { AccountIdenticon } from '../AccountIdenticon';
import { IdentityAvatar } from '../IdentityAvatar';
import { SuccessCheck } from '../SuccessCheck';
import { Button } from '../ui/button';
import { SignatureDialogProps } from './types';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { formatAddress } from '../../utils/formatAddress';
import { Globe } from 'lucide-react';

export const SignatureDialog = ({
  open,
  onOpenChange,
  message,
  origin,
  appName,
  appLogoUrl,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  mainnetRpcUrl,
  onSign,
  onCancel,
  isProcessing,
  isSuccess,
  signatureStatus,
  canSign,
}: SignatureDialogProps) => {
  const signerAddress = accountAddress ?? '';
  const { name: resolvedName, avatar: avatarUrl } = useReverseIdentity(accountAddress, chainId, mainnetRpcUrl);

  // ENS name when resolved, otherwise the truncated address (address-first).
  const displayName = resolvedName || formatAddress(signerAddress);
  const hasError = signatureStatus.includes('Error');
  const safeAppName = sanitizeDisplayName(appName ?? '') || 'dApp';

  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img
      src={appLogoUrl ?? undefined}
      alt={`${safeAppName} logo`}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />
  );

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      contentStyle={{
        width: 'fit-content',
        background: 'transparent',
        border: 'none',
        boxShadow: 'none',
      }}
      innerStyle={{ padding: 0, overflow: 'visible' }}
    >
      {/* Taller floor than the default shell so the message box has room and the
          card doesn't jump between short and long messages (canvas: min 447). */}
      <DialogShell contentClassName="min-h-[447px]">
        {isSuccess ? (
          // Brief success beat before the parent closes the dialog.
          <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <SuccessCheck size={52} />
            <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Signed</h2>
          </div>
        ) : isProcessing ? (
          // Signing in progress — passkey ceremony running.
          <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex items-center gap-3">
              <IdentityAvatar
                src={avatarUrl ?? undefined}
                className="h-11 w-11 rounded-[13px]"
                fallback={<AccountIdenticon seed={signerAddress.toLowerCase()} size={44} />}
              />
              <span className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="jaw-flow-dot bg-foreground/70 h-1.5 w-1.5 rounded-full"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </span>
              <span className="bg-secondary border-border flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border">
                {appAvatar}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Signing...</h2>
              <p className="text-muted-foreground text-xs">Confirm with your passkey</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-6 pt-7">
            <DialogAppHeader
              appName={appName}
              appLogoUrl={appLogoUrl}
              origin={origin}
              chainName={chainName}
              chainIcon={chainIcon}
            />

            {/* Signing account — flush with the header logo and the message-box
                border (the card content column). */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-base font-semibold tracking-[-0.02em]">Signing as</h2>
              <AccountPill seedAddress={signerAddress} label={displayName} avatarUrl={avatarUrl} />
            </div>

            {/* Message */}
            <div className="border-border mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10.5px] border p-3">
              <span className="text-muted-foreground mb-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                Message
              </span>
              <p className="text-foreground min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.65]">
                {message || 'No message provided'}
              </p>
            </div>

            {hasError && (
              <div className="bg-destructive/10 border-destructive/20 mt-3 rounded-[10.5px] border px-3 py-2">
                <span className="text-destructive break-words text-xs">{signatureStatus}</span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isProcessing}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onSign}
                disabled={!canSign}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Sign
              </Button>
            </div>
          </div>
        )}
      </DialogShell>
    </DefaultDialog>
  );
};

export * from './types';
