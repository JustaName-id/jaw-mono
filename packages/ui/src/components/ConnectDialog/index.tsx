'use client';

import { useState, useEffect } from 'react';
import { Eye, CircleDollarSign, ShieldCheck, Globe } from 'lucide-react';
import { DefaultDialog } from '../DefaultDialog';
import { DialogShell } from '../DialogShell';
import { AccountIdenticon } from '../AccountIdenticon';
import { Button } from '../ui/button';
import { ConnectDialogProps } from './types';
import { reverseResolveAddresses } from '../../utils/reverseResolve';
import { getChainLabel } from '../../utils/resolveChainLabel';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';

const CAPABILITY_ROWS = [
  { Icon: Eye, label: 'Can see your address' },
  { Icon: CircleDollarSign, label: 'Can propose transactions' },
  { Icon: ShieldCheck, label: "Can't move funds without approval" },
] as const;

export const ConnectDialog = ({
  open,
  onOpenChange,
  appName,
  appLogoUrl,
  origin,
  walletAddress,
  chainName,
  chainId,
  chainIcon,
  mainnetRpcUrl,
  onConnect,
  onCancel,
  showPermissions = true,
  isProcessing,
}: ConnectDialogProps) => {
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Resolve wallet address to human-readable name
  useEffect(() => {
    if (walletAddress && chainId) {
      reverseResolveAddresses([{ address: walletAddress, chainId }], mainnetRpcUrl)
        .then(async (resolved) => {
          const name = resolved[walletAddress.toLowerCase()];
          if (name) {
            const label = await getChainLabel(chainId, mainnetRpcUrl);
            setResolvedAddress(label ? `${name}@${label}` : name);
          }
        })
        .catch(() => {
          // Silently fail if resolution fails
        });
    }
  }, [walletAddress, chainId]);

  // appName is externally-controlled (dApp metadata); sanitize before display.
  const safeAppName = sanitizeDisplayName(appName) || 'dApp';

  // Format origin to display only domain (remove protocol)
  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return origin;
    }
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Reverse-resolved ENS name when available, otherwise the truncated address —
  // never the raw local username (not a portable identity).
  const displayName = resolvedAddress || formatAddress(walletAddress);

  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img src={appLogoUrl} alt={`${safeAppName} logo`} className="h-full w-full rounded-full object-cover" />
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
      <DialogShell>
        {isProcessing ? (
          // Connecting state — secure session being established.
          <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex items-center gap-3">
              <AccountIdenticon seed={walletAddress.toLowerCase()} size={44} />
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
              <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Connecting...</h2>
              <p className="text-muted-foreground text-xs">Establishing a secure session with {safeAppName}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col p-6 pt-7">
            {/* App identity */}
            <div className="flex items-center gap-3">
              <span className="relative flex-none">
                <span className="bg-secondary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.10)]">
                  {appAvatar}
                </span>
                {chainIcon && (
                  <span
                    title={chainName}
                    // The chain icon arrives pre-sized (inline 24px from useChainIconURI),
                    // so it must be forced down to the badge size or it renders cropped.
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

            {/* Connecting account */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-base font-semibold tracking-[-0.02em]">Connecting to</h2>
              <span className="bg-secondary border-border flex min-w-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5">
                <AccountIdenticon seed={walletAddress.toLowerCase()} size={15} />
                <span className="text-secondary-foreground truncate font-mono text-[10.5px]">{displayName}</span>
              </span>
            </div>

            {/* Capability rows */}
            {showPermissions && (
              <div className="border-border mt-4 flex flex-col overflow-hidden rounded-[10.5px] border">
                {CAPABILITY_ROWS.map(({ Icon, label }) => (
                  <div key={label} className="border-border flex items-center gap-2.5 border-b p-3 last:border-b-0">
                    <span className="bg-secondary border-border flex h-6 w-6 flex-none items-center justify-center rounded-[7px] border">
                      <Icon className="text-secondary-foreground h-3.5 w-3.5" strokeWidth={1.5} />
                    </span>
                    <p className="text-foreground text-[13px]">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto flex gap-2 pt-5">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={isProcessing}
                className="text-secondary-foreground h-11 flex-1 rounded-[10.5px] border-white/[.14] bg-transparent text-[13px] font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={onConnect}
                disabled={isProcessing}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold"
              >
                Connect
              </Button>
            </div>
          </div>
        )}
      </DialogShell>
    </DefaultDialog>
  );
};

export * from './types';
