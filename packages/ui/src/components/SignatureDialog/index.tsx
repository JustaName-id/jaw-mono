'use client'

import { Button } from "../ui/button";
import { DefaultDialog } from "../DefaultDialog";
import { SignatureDialogProps } from "./types";
import { useIsMobile } from "../../hooks";
import { getJustaNameInstance, getDisplayAddress } from "../../utils";
import { useState, useEffect } from "react";


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
      justaName.subnames.reverseResolve({
        address: accountAddress as `0x${string}`,
        chainId: chainId,
      }).then((result) => {
        if (result) {
          setResolvedAddress(result);
        }
      }).catch(() => {
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
      handleClose={onCancel}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex flex-row items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground leading-[100%]">
              {timestamp.toLocaleDateString('en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })} at {timestamp.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
              })}
            </p>
            {/* <InfoIcon /> */}
          </div>
          {/* Title */}
          <p className="text-[30px] font-medium leading-[100%] text-foreground">
            Signature request
          </p>
          <p className="text-sm text-muted-foreground">
            {displayAddress}
          </p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      } : {
        width: '500px',
        minWidth: '500px',
      }}
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Main Content Area - Large scrollable message box */}
        <div className="flex-1 p-4 bg-white border border-border rounded-[6px] min-h-[300px] max-h-[50vh] overflow-y-auto">
          <p className="text-sm font-normal text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {message || 'No message provided'}
          </p>
        </div>

        {/* Footer Information Section - Network and URL */}
        <div className="bg-white border border-border rounded-[6px] p-2 mt-3">
          <div className="flex flex-row gap-4">
            {/* Network Column */}
            {chainName && (
              <div className="flex flex-col gap-1 flex-1">
                <p className="text-xs font-bold text-foreground">Network</p>
                <div className="flex flex-row items-center gap-2">
                  {chainIcon && (
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                      {chainIcon}
                    </div>
                  )}
                  <p className="text-sm font-normal text-foreground">
                    {chainName}
                  </p>
                </div>
              </div>
            )}

            {/* Vertical Separator */}
            {chainName && (
              <div className="w-[1px] bg-border min-h-[40px]"></div>
            )}

            {/* URL Column */}
            <div className="flex flex-col gap-1 flex-1">
              <p className="text-xs font-bold text-foreground">URL</p>
              <p className="text-sm font-normal text-foreground">
                {formatOrigin(origin)}
              </p>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {signatureStatus && (
          <div className={`text-sm p-3 rounded-lg mt-3 ${signatureStatus.includes('Error') ? 'bg-red-50 text-red-600' :
            signatureStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
            {signatureStatus}
          </div>
        )}

        {/* Action Buttons Section */}
        <div className="flex mt-3 flex-shrink-0">
          <div className="flex gap-2 w-full justify-between">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
              className="h-9"
            >
              Cancel
            </Button>
            <Button
              onClick={onSign}
              disabled={!canSign}
              className="h-9"
            >
              {isProcessing ? 'Signing...' : 'Sign'}
            </Button>
          </div>
        </div>
      </div>
    </DefaultDialog>
  )
}

export * from './types';
