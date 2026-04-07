'use client';

import { useState, useEffect } from 'react';
import { BadgeDollarIcon, EyeIcon, CopyIcon, CopiedIcon } from '../../icons';
import { useIsMobile } from '../../hooks';
import { DefaultDialog } from '../DefaultDialog';
import { Button } from '../ui/button';
import { ConnectDialogProps } from './types';
import { getJustaNameInstance } from '../../utils/justaNameInstance';

export const ConnectDialog = ({
  open,
  onOpenChange,
  appName,
  appLogoUrl,
  origin,
  timestamp,
  accountName,
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
  const isMobile = useIsMobile();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isAddressCopied, setIsAddressCopied] = useState(false);

  // Resolve wallet address to human-readable name
  useEffect(() => {
    if (walletAddress && chainId) {
      const justaName = getJustaNameInstance(mainnetRpcUrl);
      justaName.subnames
        .reverseResolve({
          address: walletAddress as `0x${string}`,
          chainId: chainId,
        })
        .then((result) => {
          if (result) {
            setResolvedAddress(result);
          }
        })
        .catch(() => {
          // Silently fail if resolution fails
        });
    }
  }, [walletAddress, chainId]);

  // Use resolved address, then accountName prop, then truncated address
  const displayName = resolvedAddress || accountName;

  // Format origin to display only domain (remove protocol)
  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return origin;
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setIsAddressCopied(true);
      setTimeout(() => setIsAddressCopied(false), 3000);
    }
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    if (!address || address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-muted-foreground text-xs font-bold leading-[100%]">
            {timestamp.toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}{' '}
            at{' '}
            {timestamp.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short',
            })}
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex flex-row items-center gap-1">
              <p className="text-muted-foreground text-sm leading-none">
                Sign in as {displayName || formatAddress(walletAddress)}
              </p>
              {!displayName &&
                (isAddressCopied ? (
                  <CopiedIcon width={10} height={10} className="flex-shrink-0" />
                ) : (
                  <CopyIcon
                    width={10}
                    height={10}
                    onClick={() => copyToClipboard(walletAddress)}
                    className="flex-shrink-0 cursor-pointer"
                  />
                ))}
            </div>
            {displayName && (
              <div className="flex flex-row items-center gap-1">
                <p className="text-muted-foreground text-sm leading-none">{formatAddress(walletAddress)}</p>
                {isAddressCopied ? (
                  <CopiedIcon width={10} height={10} className="flex-shrink-0" />
                ) : (
                  <CopyIcon
                    width={10}
                    height={10}
                    onClick={() => copyToClipboard(walletAddress)}
                    className="flex-shrink-0 cursor-pointer"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      }
      contentStyle={
        isMobile
          ? {
              width: '100%',
              height: '100%',
              maxWidth: 'none',
              maxHeight: 'none',
            }
          : {
              width: 'fit-content',
              maxWidth: '500px',
            }
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
        {/* App Logo and Title */}
        <div className="flex flex-1 flex-col items-center justify-center p-3.5">
          {appLogoUrl && (
            <img src={appLogoUrl} alt={`${appName} logo`} className="mb-3 h-[72px] w-[72px] rounded-full" />
          )}
          <div className="text-foreground flex flex-col items-center gap-1">
            <p className="text-2xl font-normal leading-[133%]">Connect to {appName}</p>
            <p className="text-muted-foreground text-base leading-[150%]">This app wants to connect to your wallet</p>
          </div>
        </div>

        {/* Account Details Card */}
        {/* <div className="flex-1 p-3.5 bg-secondary border border-border rounded-[6px]">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-foreground">Account</span>
              <span className="text-sm font-medium text-foreground">
                {accountName || 'Wallet'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-foreground">Address</span>
              <span className="text-sm font-mono font-medium text-foreground">
                {formatAddress(walletAddress)}
              </span>
            </div>
            {supportedChains && supportedChains.length > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-foreground">Chains</span>
                <span className="text-sm font-medium text-foreground">
                  {supportedChains.length} {supportedChains.length === 1 ? 'chain' : 'chains'}
                </span>
              </div>
            )}
          </div>
        </div> */}

        {/* Permissions Section */}
        {showPermissions && (
          <div className="flex flex-col gap-2">
            <div className="border-border flex flex-row items-center gap-2.5 rounded-[6px] border p-3.5">
              <EyeIcon className="h-4 w-4 flex-shrink-0" />
              <p className="text-foreground text-xs font-normal leading-[150%]">Allow the app to see your addresses</p>
            </div>
            <div className="border-border flex flex-row items-center gap-2.5 rounded-[6px] border p-3.5">
              <BadgeDollarIcon className="h-4 w-4 flex-shrink-0" />
              <p className="text-foreground text-xs font-normal leading-[150%]">
                Allow the app to propose transactions
              </p>
            </div>
            <div className="border-border flex flex-row items-center gap-2.5 rounded-[6px] border p-3.5">
              <BadgeDollarIcon className="h-4 w-4 flex-shrink-0" />
              <p className="text-foreground text-xs font-normal leading-[150%]">
                The app cannot move funds without your permission
              </p>
            </div>
          </div>
        )}

        {/* Network and URL Information */}
        <div className="border-border flex flex-row gap-4 rounded-[6px] border p-2">
          {/* Network Column */}
          {chainName && (
            <>
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-foreground text-xs font-bold">Network</p>
                <div className="flex flex-row items-center gap-2">
                  {chainIcon && (
                    <div className="flex h-6 w-6 min-w-4 flex-shrink-0 items-center justify-center">{chainIcon}</div>
                  )}
                  <p className="text-foreground text-sm font-normal">{chainName}</p>
                </div>
              </div>
              {/* Vertical Separator */}
              <div className="bg-border min-h-[40px] w-[1px]"></div>
            </>
          )}
          {/* URL Column */}
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-foreground text-xs font-bold">URL</p>
            <p className="text-foreground text-sm font-normal">{formatOrigin(origin)}</p>
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="mt-3 flex flex-shrink-0">
          <div className="flex w-full justify-between gap-2">
            <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
              Cancel
            </Button>
            <Button onClick={onConnect} disabled={isProcessing} className="flex-1">
              {isProcessing ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from './types';
