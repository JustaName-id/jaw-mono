'use client'

import { useEffect, useState } from "react";
import { useIsMobile } from "../../hooks";
import { CopyIcon } from "../../icons";
import { getJustaNameInstance, getDisplayAddress } from "../../utils";
import { DefaultDialog } from "../DefaultDialog";
import { Button } from "../ui/button";
import { SiweDialogProps } from "./types";

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

  const onCopyMessageHandler = () => {
    navigator.clipboard.writeText(message);
  }

  return (
    <DefaultDialog
      open={open}
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
      <div className="flex flex-col h-full min-h-0 gap-3 max-md:pb-2">
        <div className="flex flex-1 flex-col p-3.5 items-center justify-center">
          {appLogoUrl && (
            <img
              src={appLogoUrl}
              alt={`${appName} logo`}
              className="w-[72px] h-[72px] rounded-full mb-3"
            />
          )}
          <div className="flex flex-col items-center gap-1 text-foreground">
            <p className="text-2xl font-normal leading-[133%] ">
              Sign in Request
            </p>
            <p className="text-base leading-[150%] font-bold">{appName}</p>
          </div>
        </div>
        {/* Main Content Area - Large scrollable message box */}
        <div className="flex-1 p-3.5 bg-white flex flex-col gap-2.5 border border-border rounded-[6px]">
          <div className="flex flex-row items-center justify-between">
            <p className="text-foreground font-bold text-xs leading-[150%]">Message</p>
            <CopyIcon className="w-4 h-4 cursor-pointer" onClick={onCopyMessageHandler} />
          </div>
          <div className="flex bg-secondary rounded-[6px] p-2.5 max-h-[35vh] overflow-y-auto">
            <p className="text-sm font-normal text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {message || 'No message provided'}
            </p>
          </div>
        </div>

        {/* Footer Information Section */}
        {/* Chain Information */}
        <div className="flex flex-row gap-4 border border-border rounded-[6px] p-2">
          {/* Network Column */}
          {chainName && (
            <>
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
              {/* Vertical Separator */}
              <div className="w-[1px] bg-border min-h-[40px]"></div>
            </>
          )}
          {/* URL Column */}
          <div className="flex flex-col gap-1 flex-1">
            <p className="text-xs font-bold text-foreground">URL</p>
            <p className="text-sm font-normal text-foreground">
              {formatOrigin(origin)}
            </p>
          </div>
        </div>

        {/* Origin Mismatch Warning */}
        {warningMessage && (
          <div className="flex items-start gap-2.5 p-3.5 border border-yellow-300 rounded-[6px] bg-yellow-50">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="flex-shrink-0 mt-0.5"
            >
              <path
                d="M8 1.5L1 14.5H15L8 1.5Z"
                stroke="#F59E0B"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8 6V9" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.5" fill="#F59E0B" />
            </svg>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold leading-[133%] text-yellow-800">Security Warning</p>
              <p className="text-xs font-normal leading-[150%] text-yellow-900">
                {warningMessage}
              </p>
            </div>
          </div>
        )}

        {/* Status Message */}
        {siweStatus && (
          <div className={`text-sm p-3 rounded-lg mt-3 ${siweStatus.includes('Error') ? 'bg-red-50 text-red-600' :
            siweStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
            {siweStatus}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 p-3.5 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onSign}
            disabled={!canSign}
            className="flex-1"
          >
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  )
}

export * from './types';

