'use client';

import { Eye, CircleDollarSign, ShieldCheck } from 'lucide-react';
import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountHeaderRow } from '../AccountHeaderRow';
import { ProcessingScreen } from '../ProcessingScreen';
import { Button } from '../ui/button';
import { ConnectDialogProps } from './types';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { AppAvatar } from '../AppAvatar';
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
  // The stale-write guard for account switches now lives in useReverseIdentity.
  const displayName = resolvedName || formatAddress(walletAddress);

  // appName is externally-controlled (dApp metadata); sanitize before display.
  const safeAppName = sanitizeDisplayName(appName) || 'dApp';

  const appAvatar = <AppAvatar appName={appName} appLogoUrl={appLogoUrl} />;

  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing} onClose={onCancel}>
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
            <div className="border-border rounded-box mt-4 flex flex-col overflow-hidden border">
              {CAPABILITY_ROWS.map(({ Icon, label }) => (
                <div key={label} className="border-border/40 flex items-center gap-3 border-b p-3 last:border-b-0">
                  <span className="bg-secondary border-border rounded-chip flex h-6 w-6 flex-none items-center justify-center border">
                    <Icon className="text-secondary-foreground h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                  <p className="text-foreground text-body">{label}</p>
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
              className="rounded-box text-button h-11 flex-1 font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={onConnect}
              disabled={isProcessing}
              className="rounded-box text-button h-11 flex-1 font-semibold"
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
