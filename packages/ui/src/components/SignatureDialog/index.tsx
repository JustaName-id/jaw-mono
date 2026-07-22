'use client';

import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { DefaultDialog } from '../DefaultDialog';
import { DialogShell } from '../DialogShell';
import { AccountIdenticon } from '../AccountIdenticon';
import { IdentityAvatar } from '../IdentityAvatar';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';
import { SignatureDialogProps } from './types';
import { reverseResolveWithAvatars } from '../../utils/reverseResolve';
import { getChainLabel } from '../../utils/resolveChainLabel';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { cn } from '../../lib/utils';

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
  signatureStatus,
  canSign,
}: SignatureDialogProps) => {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // False until reverse-resolution finishes (or there's nothing to resolve), so
  // the pill reveals once as name-or-address instead of flashing the address and
  // then jumping to the ENS name.
  const [identitySettled, setIdentitySettled] = useState(false);

  // Resolve the signer address to an ENS name + avatar for the "Signing as" pill.
  useEffect(() => {
    setResolvedAddress(null);
    setAvatarUrl(null);
    setIdentitySettled(false);
    if (!accountAddress) return; // signer not known yet → stay skeletal
    if (!chainId) {
      setIdentitySettled(true); // can't reverse-resolve → reveal the address
      return;
    }
    let cancelled = false;
    reverseResolveWithAvatars([{ address: accountAddress, chainId }], mainnetRpcUrl)
      .then(async (resolved) => {
        if (cancelled) return;
        const identity = resolved[accountAddress.toLowerCase()];
        if (identity) {
          const label = await getChainLabel(chainId, mainnetRpcUrl);
          if (cancelled) return;
          setResolvedAddress(label ? `${identity.name}@${label}` : identity.name);
          setAvatarUrl(identity.avatar ?? null);
        }
      })
      .catch(() => {
        // Silently fall back to the truncated address + blob
      })
      .finally(() => {
        if (!cancelled) setIdentitySettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountAddress, chainId]);

  // appName is externally-controlled (dApp metadata); sanitize before display.
  const safeAppName = sanitizeDisplayName(appName ?? '') || 'dApp';

  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return origin;
    }
  };

  const formatAddress = (address: string) => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Reverse-resolved ENS name when available, otherwise the truncated address.
  const signerAddress = accountAddress ?? '';
  const displayName = resolvedAddress || formatAddress(signerAddress);
  const hasError = signatureStatus.includes('Error');

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
        {isProcessing ? (
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
            {/* App identity */}
            <div className="flex items-center gap-3">
              <span className="relative flex-none">
                <span className="bg-secondary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.10)]">
                  {appAvatar}
                </span>
                {chainIcon && (
                  <span
                    title={chainName}
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full shadow-[0_0_0_2.5px_#0A1020] [&>*]:!h-full [&>*]:!w-full [&>*]:!min-w-0"
                  >
                    {chainIcon}
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground truncate text-[17px] font-semibold tracking-[-0.02em]">
                  {safeAppName}
                </span>
                <span className="text-muted-foreground truncate font-mono text-[10px]">{formatOrigin(origin)}</span>
              </span>
            </div>

            {/* Signing account */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-base font-semibold tracking-[-0.02em]">Signing as</h2>
              {identitySettled ? (
                <span className="bg-secondary border-border flex min-w-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5">
                  <IdentityAvatar
                    src={avatarUrl ?? undefined}
                    className="h-[15px] w-[15px] rounded-full"
                    fallback={<AccountIdenticon seed={signerAddress.toLowerCase()} size={15} />}
                  />
                  <span
                    className={cn(
                      'text-secondary-foreground truncate font-mono',
                      displayName.length > 40 ? 'text-[9px]' : 'text-[10.5px]'
                    )}
                  >
                    {displayName}
                  </span>
                </span>
              ) : (
                // One clean reveal — no address→ENS flash.
                <Skeleton className="h-[27px] w-32 rounded-full" />
              )}
            </div>

            {/* Message */}
            <div className="border-border mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10.5px] border p-3">
              <span className="text-muted-foreground mb-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                Message
              </span>
              <p className="text-secondary-foreground min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.65]">
                {message || 'No message provided'}
              </p>
            </div>

            {hasError && (
              <div className="bg-destructive/10 border-destructive/20 mt-3 rounded-[10.5px] border px-3 py-2">
                <span className="text-destructive-foreground break-words text-xs">{signatureStatus}</span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isProcessing}
                className="text-secondary-foreground h-11 flex-1 rounded-[10.5px] border-white/[.14] bg-transparent text-[13px] font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={onSign}
                disabled={!canSign}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold"
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
