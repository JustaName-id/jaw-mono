'use client';

import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountHeaderRow } from '../AccountHeaderRow';
import { SuccessScreen } from '../SuccessScreen';
import { ProcessingScreen } from '../ProcessingScreen';
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
    // Taller floor than the default shell so the message box has room and the
    // card doesn't jump between short and long messages (canvas: min 447).
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing} contentClassName="min-h-[447px]">
      {isSuccess ? (
        // Brief success beat before the parent closes the dialog.
        <SuccessScreen seedAddress={signerAddress} avatarUrl={avatarUrl} />
      ) : isProcessing ? (
        // Signing in progress — passkey ceremony running.
        <ProcessingScreen
          seedAddress={signerAddress}
          avatarUrl={avatarUrl}
          appAvatar={appAvatar}
          title="Signing..."
          subtitle="Confirm with your passkey"
        />
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
          <AccountHeaderRow
            label="Signing as"
            seedAddress={signerAddress}
            displayName={displayName}
            avatarUrl={avatarUrl}
          />

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
    </ShellDialog>
  );
};

export * from './types';
