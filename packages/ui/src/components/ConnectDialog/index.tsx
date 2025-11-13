'use client'

import { BadgeDollarIcon, EyeIcon } from "../../icons";
import { useIsMobile } from "../../hooks";
import { DefaultDialog } from "../DefaultDialog";
import { Button } from "../ui/button";
import { ConnectDialogProps } from "./types";

export const ConnectDialog = ({
  open,
  onOpenChange,
  appName,
  appLogoUrl,
  origin,
  timestamp,
  accountName,
  walletAddress,
  supportedChains,
  chainName,
  chainId,
  chainIcon,
  onConnect,
  onCancel,
  isProcessing,
}: ConnectDialogProps) => {
  const isMobile = useIsMobile();

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

  return (
    <DefaultDialog
      open={open}
      handleClose={onCancel}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
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
          <div className="flex flex-col gap-1">
            <p className="text-sm leading-none text-muted-foreground">
              Sign in as {accountName || formatAddress(walletAddress)}
            </p>
            {accountName && (
              <p className="text-sm leading-none text-muted-foreground">
                {formatAddress(walletAddress)}
              </p>
            )}
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
        {/* App Logo and Title */}
        <div className="flex flex-1 flex-col p-3.5 items-center justify-center">
          {appLogoUrl && (
            <img
              src={appLogoUrl}
              alt={`${appName} logo`}
              className="w-[72px] h-[72px] rounded-full mb-3"
            />
          )}
          <div className="flex flex-col items-center gap-1 text-foreground">
            <p className="text-2xl font-normal leading-[133%]">
              Connect to {appName}
            </p>
            <p className="text-base leading-[150%] text-muted-foreground">
              This app wants to connect to your wallet
            </p>
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
            <EyeIcon className="w-4 h-4 flex-shrink-0" />
            <p className="text-foreground text-xs font-normal leading-[150%]">
              Allow the app to see your addresses
            </p>
          </div>
          <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
            <BadgeDollarIcon className="w-4 h-4 flex-shrink-0" />
            <p className="text-foreground text-xs font-normal leading-[150%]">
              Allow the app to propose transactions
            </p>
          </div>
          <div className="flex items-center flex-row gap-2.5 p-3.5 border border-border rounded-[6px]">
            <BadgeDollarIcon className="w-4 h-4 flex-shrink-0" />
            <p className="text-foreground text-xs font-normal leading-[150%]">
              The app cannot move funds without your permission
            </p>
          </div>
        </div>

        {/* Network and URL Information */}
        <div className="flex flex-row gap-4 border border-border rounded-[6px] p-2">
          {/* Network Column */}
          {chainName && (
            <>
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

        {/* Action Buttons Section */}
        <div className="flex mt-3">
          <div className="flex gap-2 w-full justify-between">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isProcessing}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={onConnect}
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </div>
      </div>
    </DefaultDialog>
  )
}

export * from './types';
