'use client';

import { Button } from '../ui/button';
import { DefaultDialog } from '../DefaultDialog';
import { SignatureDialogProps } from './types';
import { useIsMobile } from '../../hooks';
import { getJustaNameInstance, getDisplayAddress, getChainLabel } from '../../utils';
import { useState, useEffect } from 'react';

export const SignatureDialog = ({
  open,
  onOpenChange,
  message,
  origin,
  timestamp,
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
          {/* Title */}
          <p className="text-foreground text-[30px] font-medium leading-[100%]">Signature request</p>
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
      <div className="flex h-full min-h-0 flex-col max-md:pb-2">
        {/* Main Content Area - Large scrollable message box */}
        <div className="bg-card border-border max-h-[50vh] min-h-[300px] flex-1 overflow-y-auto rounded-[6px] border p-4">
          <p className="text-foreground whitespace-pre-wrap break-words text-sm font-normal leading-relaxed">
            {message || 'No message provided'}
          </p>
        </div>

        {/* Footer Information Section - Network and URL */}
        <div className="bg-card border-border mt-3 rounded-[6px] border p-2">
          <div className="flex flex-row gap-4">
            {/* Network Column */}
            {chainName && (
              <div className="flex flex-1 flex-col gap-1">
                <p className="text-foreground text-xs font-bold">Network</p>
                <div className="flex flex-row items-center gap-2">
                  {chainIcon && (
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">{chainIcon}</div>
                  )}
                  <p className="text-foreground text-sm font-normal">{chainName}</p>
                </div>
              </div>
            )}

            {/* Vertical Separator */}
            {chainName && <div className="bg-border min-h-[40px] w-[1px]"></div>}

            {/* URL Column */}
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-foreground text-xs font-bold">URL</p>
              <p className="text-foreground text-sm font-normal">{formatOrigin(origin)}</p>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {signatureStatus && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              signatureStatus.includes('Error')
                ? 'bg-destructive/10 text-destructive'
                : signatureStatus.includes('successfully')
                  ? 'bg-success/10 text-success'
                  : 'bg-info/10 text-info'
            }`}
          >
            {signatureStatus}
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
