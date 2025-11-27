'use client'

import { Button } from "../ui/button";
import { DefaultDialog } from "../DefaultDialog";
import { PermissionDialogProps } from "./types";
import { useIsMobile, useChainIcon } from "../../hooks";
import {CopiedIcon, CopyIcon, WalletIcon} from "../../icons";
import { useState, useEffect } from "react";
import { getJustaNameInstance } from "../../utils/justaNameInstance";

export const PermissionDialog = ({
  open,
  onOpenChange,
  mode,
  permissionId,
  spenderAddress,
  origin,
  spends = [],
  calls = [],
  expiryDate,
  networkName,
  chainId,
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
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});

  // Resolve addresses to human-readable names
  useEffect(() => {
    if (!chainId) return;

    const justaName = getJustaNameInstance();

    // Resolve spender address
    if (spenderAddress) {
      justaName.subnames.reverseResolve({
        address: spenderAddress as `0x${string}`,
        chainId: chainId,
      }).then((result) => {
        if (result) {
          setResolvedAddresses(prev => ({ ...prev, [spenderAddress]: result }));
        }
      }).catch(() => {
        // Silently fail if resolution fails
      });
    }

    // Resolve call target addresses
    calls.forEach((call) => {
      if (call.target) {
        justaName.subnames.reverseResolve({
          address: call.target as `0x${string}`,
          chainId: chainId,
        }).then((result) => {
          if (result) {
            setResolvedAddresses(prev => ({ ...prev, [call.target]: result }));
          }
        }).catch(() => {
          // Silently fail if resolution fails
        });
      }
    });
  }, [spenderAddress, calls, chainId]);

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

  const canConfirm = !isProcessing;

  // Count total permissions
  const totalSpends = spends.length;
  const totalCalls = calls.length;
  const totalPermissions = totalSpends + totalCalls;

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
            {mode === 'grant' ? 'Permission Request' : 'Revoke Permission'}
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
        maxHeight: '90vh',
        overflowY: 'auto',
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
                  {resolvedAddresses[spenderAddress] || truncateAddress(spenderAddress)}
                </p>
              </div>
            </div>
          </div>

          {/* Permissions Summary */}
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
              <p className="text-xs font-bold leading-[133%]">Expiry Date</p>
              <p className="text-base font-normal leading-[150%]">{expiryDate}</p>
            </div>
          </div>

          {/* Spend Permissions Section */}
          {totalSpends > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground px-1">
                Spend Permissions ({totalSpends})
              </p>
              <div className="flex flex-col gap-2">
                {spends.map((spend, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-3 p-3.5 border border-border rounded-[6px] bg-background"
                  >
                    {/* Amount */}
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Amount</p>
                      {isLoadingTokenInfo ? (
                        <div className="h-[30px] w-32 bg-muted animate-pulse rounded" />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-normal leading-[150%] text-foreground">
                            {spend.amount}
                          </p>
                          {spend.amountUsd && (
                            <p className="text-sm font-bold text-muted-foreground">${spend.amountUsd}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Duration and Token */}
                    <div className="flex flex-row justify-between items-center gap-2.5">
                      <div className="flex flex-col gap-0.5 flex-1">
                        <p className="text-xs font-bold leading-[133%] text-muted-foreground">Duration</p>
                        <p className="text-base font-normal leading-[150%] text-foreground">{spend.duration}</p>
                      </div>
                      <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[40px]" />
                      <div className="flex flex-col gap-0.5 flex-1">
                        <p className="text-xs font-bold leading-[133%] text-muted-foreground">Token</p>
                        <p className="text-base font-normal leading-[150%] text-foreground">{spend.token}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call Permissions Section */}
          {totalCalls > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-foreground px-1">
                Call Permissions ({totalCalls})
              </p>
              <div className="flex flex-col gap-2">
                {calls.map((call, index) => (
                  <div
                    key={index}
                    className="flex flex-col gap-2.5 p-3.5 border border-border rounded-[6px] bg-background"
                  >
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Function</p>
                      <code className="text-sm font-mono leading-[150%] text-foreground break-all">
                        {call.functionSignature}
                      </code>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-bold leading-[133%] text-muted-foreground">Contract</p>
                      <p className="text-sm font-mono leading-[150%] text-foreground break-all">
                        {resolvedAddresses[call.target] || call.target}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                  You are granting {totalPermissions} permission{totalPermissions > 1 ? 's' : ''}
                  {totalSpends > 0 && ` (${totalSpends} spend`}
                  {totalSpends > 1 && 's'}
                  {totalSpends > 0 && ')'}
                  {totalCalls > 0 && ` (${totalCalls} call`}
                  {totalCalls > 1 && 's'}
                  {totalCalls > 0 && ')'}
                  {' '}to this dApp until {expiryDate}. Only approve if you trust this dApp.
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
                  This will revoke all permissions and prevent the spender from making any further transactions on your behalf.
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