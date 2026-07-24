'use client';

import { Eye, CircleDollarSign, ShieldCheck, Globe } from 'lucide-react';
import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountHeaderRow } from '../AccountHeaderRow';
import { ProcessingScreen } from '../ProcessingScreen';
import { Button } from '../ui/button';
import { ConnectDialogProps } from './types';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { formatAddress } from '../../utils/formatAddress';

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
  const { name: resolvedName, avatar: avatarUrl } = useReverseIdentity(walletAddress, chainId, mainnetRpcUrl);

  // ENS name when resolved, otherwise the truncated address — never the raw
  // local username (not a portable identity). Address-first, upgrades in place.
  const displayName = resolvedName || formatAddress(walletAddress);
  const safeAppName = sanitizeDisplayName(appName) || 'dApp';

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
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing}>
      {isProcessing ? (
        // Connecting state — secure session being established.
        <ProcessingScreen
          seedAddress={walletAddress}
          avatarUrl={avatarUrl}
          appAvatar={appAvatar}
          title="Connecting..."
          subtitle={`Establishing a secure session with ${safeAppName}`}
        />
      ) : (
        <div className="flex flex-1 flex-col p-6 pt-7">
          <DialogAppHeader
            appName={appName}
            appLogoUrl={appLogoUrl}
            origin={origin}
            chainName={chainName}
            chainIcon={chainIcon}
          />

          {/* Connecting account */}
          <AccountHeaderRow
            label="Connecting to"
            seedAddress={walletAddress}
            displayName={displayName}
            avatarUrl={avatarUrl}
          />

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
              variant="secondary"
              onClick={onCancel}
              disabled={isProcessing}
              className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold"
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
    </ShellDialog>
  );
};

export * from './types';
