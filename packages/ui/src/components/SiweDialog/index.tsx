'use client'

import { BadgeDollarIcon, CopyIcon, EyeIcon } from "@jaw/ui";
import { useEffect, useState } from "react";
import { useIsMobile } from "../../hooks";
import { getJustaNameInstance } from "../../utils/justaNameInstance";
import { DefaultDialog } from "../DefaultDialog";
import { Button } from "../ui/button";
import { SiweDialogProps } from "./types";

export const SiweDialog = ({
  open,
  onOpenChange,
  message,
  origin,
  timestamp,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  onSign,
  onCancel,
  isProcessing,
  siweStatus,
  canSign,
}: SiweDialogProps) => {
  const isMobile = useIsMobile();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Resolve account address to human-readable name
  useEffect(() => {
    if (accountAddress && chainId) {
      const justaName = getJustaNameInstance();
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

  // Get resolved address or fallback to original
  const displayAddress = resolvedAddress || accountAddress || '';

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
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      } : {
        width: 'fit-content',
        maxWidth: '500px',
      }}
    >
      <div className="flex flex-col h-full gap-3">
        <div className="flex flex-1 flex-col p-3.5 items-center justify-center">
          <img
            src="/images/siwe-logo.svg"
            alt="SIWE Logo"
            className="w-[72px] h-[72px] rounded-full"
          />
          <div className="flex flex-col items-center gap-1 text-foreground">
            <p className="text-2xl font-normal leading-[133%] ">
              Sign in Request
            </p>
            <p className="text-base leading-[150%] font-bold">JustaName App</p>
          </div>
        </div>
        {/* Main Content Area - Large scrollable message box */}
        <div className="flex-1 p-3.5 bg-white flex flex-col gap-2.5 border border-border rounded-[6px] overflow-y-auto">
          <div className="flex flex-row items-center justify-between">
            <p className="text-foreground font-bold text-xs leading-[150%]">Message</p>
            <CopyIcon className="w-4 h-4" onClick={onCopyMessageHandler} />
          </div>
          <div className="flex bg-secondary rounded-[6px] p-2.5 min-h-[70px]">
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
            <div className="flex flex-col gap-1 flex-1">
              <p className="text-xs font-bold text-foreground">Network</p>
              <div className="flex flex-row items-center gap-2">
                {chainIcon && (
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
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
        <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
          <EyeIcon className="w-4 h-4" />
          <p className="text-foreground text-xs font-normal leading-[150%]">Allow the app to see your addresses</p>
        </div>
        <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
          <BadgeDollarIcon className="w-4 h-4" />
          <p className="text-foreground text-xs font-normal leading-[150%]">Allow the app to propose transactions</p>
        </div>
        <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
          <BadgeDollarIcon className="w-4 h-4" />
          <p className="text-foreground text-xs font-normal leading-[150%]">The app cannot move funds without your permission</p>
        </div>
        {/* Status Message */}
        {siweStatus && (
          <div className={`text-sm p-3 rounded-lg mt-3 ${siweStatus.includes('Error') ? 'bg-red-50 text-red-600' :
            siweStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
            {siweStatus}
          </div>
        )}

        {/* Action Buttons Section */}
        <div className="flex mt-3">
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

