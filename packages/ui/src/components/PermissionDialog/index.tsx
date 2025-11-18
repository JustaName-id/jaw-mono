'use client'

import { Button } from "../ui/button";
import { DefaultDialog } from "../DefaultDialog";
import { PermissionDialogProps } from "./types";
import { useIsMobile, useChainIcon, useTokenIcon } from "../../hooks";
import {CopiedIcon, CopyIcon, WalletIcon} from "../../icons";
import { useState } from "react";

export const PermissionDialog = ({
  open,
  onOpenChange,
  mode,
  permissionId,
  spenderAddress,
  origin,
  amount,
  amountUsd,
  token,
  duration,
  expiryDate,
  limit,
  networkName,
  chainIcon,
  chainIconKey,
  onConfirm,
  onCancel,
  isProcessing,
  status,
  isLoadingTokenInfo = false,
  timestamp = new Date(),
}: PermissionDialogProps) => {
  const isMobile = useIsMobile();
  const [isPermissionIdCopied, setIsPermissionIdCopied] = useState(false);

  // Get chain icon using the hook
  const defaultChainIcon = useChainIcon(chainIconKey || networkName?.toLowerCase() || 'ethereum', 24);
  const displayChainIcon = chainIcon || defaultChainIcon;

  // Truncate address for display (e.g., 0x43e...ead3)
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 5)}...${address.slice(-4)}`;
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, setCopied: (value: boolean) => void) => {
    if (typeof window !== 'undefined' && navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // Extract token symbol from token prop
  // "Native Token (ETH)" -> "ETH"
  // "USDC" -> "USDC"
  const getTokenSymbol = (tokenDisplay: string) => {
    const match = tokenDisplay.match(/\(([^)]+)\)/);
    return match ? match[1] : tokenDisplay;
  };

  const tokenSymbol = getTokenSymbol(token);
  const tokenIcon = useTokenIcon(tokenSymbol, 20);
  const canConfirm = !isProcessing;

  return (
    <DefaultDialog
      open={open}
      onOpenChange={isProcessing ? undefined : onOpenChange}
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
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            {mode === 'grant' ? 'Spend Permission Request' : 'Revoke Spend Permission'}
          </p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        overflowY: 'auto',
      } : {
        width: '500px',
        minWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        <div className="flex flex-col gap-3">
          {/* Permission ID Card - Only for revoke mode */}
          {mode === 'revoke' && permissionId && (
            <div className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[6px]">
              <div className="flex flex-row items-center justify-between">
                <p className="text-xs font-bold leading-[133%] text-foreground">Permission ID</p>
                {isPermissionIdCopied ? (
                  <CopiedIcon width={16} height={16} />
                ) : (
                  <CopyIcon
                    width={16}
                    height={16}
                    onClick={() => copyToClipboard(permissionId, setIsPermissionIdCopied)}
                    className="cursor-pointer"
                  />
                )}
              </div>
              <p className="text-base font-normal leading-[150%] text-foreground break-all">
                {permissionId}
              </p>
            </div>
          )}

          {/* Requesting dApp + Spender Address */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">Requesting dApp</p>
              <p className="text-base font-normal leading-[150%] truncate overflow-hidden">
                {origin}
              </p>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">Spender Address</p>
              <div className="flex flex-row items-center gap-1">
                  <WalletIcon className="w-3 h-3 flex-shrink-0" stroke="black" />
                  <p className="text-base font-normal leading-[150%] truncate overflow-hidden">
                  {truncateAddress(spenderAddress)}
                </p>
              </div>
            </div>
          </div>

          {/* Duration + Expiry Date */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Duration</p>
              <p className="text-base bold leading-[150%]">{duration}</p>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Expiry Date</p>
              <p className="text-base font-normal leading-[150%]">{expiryDate}</p>
            </div>
          </div>

          {/* Amount Card */}
          <div className="flex flex-row items-center justify-between gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-row items-center gap-2.5 flex-1">
              {/* Token Icon */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                {tokenIcon}
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-bold leading-[133%] text-foreground">Amount</p>
                {isLoadingTokenInfo ? (
                  <div className="h-[30px] w-32 bg-muted animate-pulse rounded" />
                ) : (
                  <p className="text-xl font-normal leading-[150%] text-foreground">{amount} {tokenSymbol}</p>
                )}
              </div>
            </div>
            {amountUsd && (
              <p className="text-sm font-bold text-muted-foreground">${amountUsd}</p>
            )}
          </div>

          {/* Network + Token */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Network</p>
              <div className="flex flex-row items-center gap-1">
                {displayChainIcon}
                <p className="text-base font-normal leading-[150%]">{networkName}</p>
              </div>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 flex-1">
              <p className="text-xs font-bold leading-[133%]">Token</p>
              <p className="text-base font-normal leading-[150%]">{token}</p>
            </div>
          </div>

          {/* Warning (Grant) / Info (Revoke) Card */}
          {mode === 'grant' ? (
            <div className="flex items-start gap-2.5 p-3.5 border border-border rounded-[6px] bg-yellow-50">
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
                <path
                  d="M8 6V9"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="11.5"
                  r="0.5"
                  fill="#F59E0B"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold leading-[133%] text-yellow-800">Warning</p>
                <p className="text-xs font-normal leading-[150%] text-yellow-900">
                  This will allow the spender to transfer up to {limit} per day from your account until {expiryDate}. Only approve if you trust this dApp.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3.5 border border-border rounded-[6px] bg-blue-50">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="flex-shrink-0 mt-0.5"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 7V11"
                  stroke="#3B82F6"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="8"
                  cy="5"
                  r="0.5"
                  fill="#3B82F6"
                />
              </svg>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-bold leading-[133%] text-blue-800">Info</p>
                <p className="text-xs font-normal leading-[150%] text-blue-900">
                  This will revoke the permission and prevent the spender from making any further transactions on your behalf.
                </p>
              </div>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div className={`text-sm p-3 rounded-lg ${
              status.includes('Error') ? 'bg-red-50 text-red-600' :
              status.includes('successfully') ? 'bg-green-50 text-green-600' :
              'bg-blue-50 text-blue-600'
            }`}>
              {status}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 p-3.5 max-md:mt-auto">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant={mode === 'revoke' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={!canConfirm}
            className="flex-1"
          >
            {isProcessing ? 'Processing...' : mode === 'grant' ? 'Accept' : 'Revoke'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from './types';
