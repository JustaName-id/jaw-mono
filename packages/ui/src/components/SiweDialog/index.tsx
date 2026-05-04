'use client';

import { useEffect, useState } from 'react';
import { useIsMobile } from '../../hooks';
import { CopyIcon } from '../../icons';
import { getJustaNameInstance, getDisplayAddress, getChainLabel } from '../../utils';
import { DefaultDialog } from '../DefaultDialog';
import { Button } from '../ui/button';
import { SiweDialogProps } from './types';

export const SiweDialog = ({
  open,
  onOpenChange,
  message,
  timestamp,
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
  siweStatus,
  canSign,
  warningMessage,
}: SiweDialogProps) => {
  const isMobile = useIsMobile();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Resolve account address to human-readable name
  useEffect(() => {
    if (accountAddress && chainId) {
      const justaName = getJustaNameInstance(mainnetRpcUrl);
      justaName.subnames
        .reverseResolve({
          address: accountAddress as `0x${string}`,
          chainId: chainId,
        })
        .then(async (result) => {
          if (result) {
            const label = await getChainLabel(chainId, mainnetRpcUrl);
            setResolvedAddress(label ? `${result}@${label}` : result);
          }
        })
        .catch(() => {
          // Silently fail if resolution fails
        });
    }
  }, [accountAddress, chainId]);

  // Get display address - use resolved name or formatted address
  const displayAddress = getDisplayAddress(resolvedAddress, accountAddress || '');

  // Format origin to display only domain (remove protocol)
  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return origin;
    }
  };

  const onCopyMessageHandler = () => {
    navigator.clipboard.writeText(message);
  };

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex flex-row items-center justify-between">
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
            {/* <InfoIcon /> */}
          </div>
          <p className="text-muted-foreground text-sm">{displayAddress}</p>
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
              width: '500px',
              minWidth: '500px',
            }
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 max-md:pb-2">
        <div className="flex flex-1 flex-col items-center justify-center p-3.5">
          {appLogoUrl && (
            <img src={appLogoUrl} alt={`${appName} logo`} className="mb-3 h-[72px] w-[72px] rounded-full" />
          )}
          <div className="text-foreground flex flex-col items-center gap-1">
            <p className="text-2xl font-normal leading-[133%]">Sign in Request</p>
            <p className="text-base font-bold leading-[150%]">{appName}</p>
          </div>
        </div>
        {/* Main Content Area - Large scrollable message box */}
        <div className="bg-card border-border flex flex-1 flex-col gap-2.5 rounded-[6px] border p-3.5">
          <div className="flex flex-row items-center justify-between">
            <p className="text-foreground text-xs font-bold leading-[150%]">Message</p>
            <CopyIcon className="h-4 w-4 cursor-pointer" onClick={onCopyMessageHandler} />
          </div>
          <div className="bg-secondary flex max-h-[35vh] overflow-y-auto rounded-[6px] p-2.5">
            <p className="text-foreground whitespace-pre-wrap break-words text-sm font-normal leading-relaxed">
              {message || 'No message provided'}
            </p>
          </div>
        </div>

        {/* Footer Information Section */}
        {/* Chain Information */}
        <div className="border-border flex flex-row gap-4 rounded-[6px] border p-2">
          {/* Network Column */}
          {chainName && (
            <>
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-foreground text-xs font-bold">Network</p>
                <div className="flex flex-row items-center gap-2">
                  {chainIcon && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">{chainIcon}</div>
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

        {/* Origin Mismatch Warning */}
        {warningMessage && (
          <div className="border-warning/30 bg-warning/10 flex items-start gap-2.5 rounded-[6px] border p-3.5">
            <div className="text-warning mt-0.5 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M8 1.5L1 14.5H15L8 1.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M8 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-warning-foreground text-xs font-bold leading-[133%]">Security Warning</p>
              <p className="text-warning-foreground text-xs font-normal leading-[150%]">{warningMessage}</p>
            </div>
          </div>
        )}

        {/* Status Message */}
        {siweStatus && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              siweStatus.includes('Error')
                ? 'bg-destructive/10 text-destructive'
                : siweStatus.includes('successfully')
                  ? 'bg-success/10 text-success'
                  : 'bg-info/10 text-info'
            }`}
          >
            {siweStatus}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-shrink-0 gap-3 p-3.5">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onSign} disabled={!canSign} className="flex-1">
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from './types';
