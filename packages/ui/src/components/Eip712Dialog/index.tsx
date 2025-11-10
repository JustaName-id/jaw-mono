'use client'

import { Button } from "../ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { DefaultDialog } from "../DefaultDialog";
import { Eip712DialogProps } from "./types";
import { useIsMobile } from "../../hooks";
import { getJustaNameInstance } from "../../utils/justaNameInstance";
import { useState, useEffect, useMemo } from "react";

// EIP-712 TypedData structure
interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

// Recursive component to render nested objects
const NestedDataView = ({ data, depth = 0 }: { data: unknown; depth?: number }) => {
  const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  const isArray = (value: unknown): value is unknown[] => {
    return Array.isArray(value);
  };

  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  };

  if (isObject(data)) {
    const entries = Object.entries(data);

    return (
      <Accordion type="multiple" className="w-full" defaultValue={depth === 0 ? ['object-root'] : []}>
        <AccordionItem value="object-root" className="border border-border rounded-[6px] overflow-hidden">
          <AccordionTrigger className="px-3.5 py-2.5 hover:no-underline bg-white">
            <span className="text-sm font-medium text-foreground">Object</span>
          </AccordionTrigger>
          <AccordionContent className="px-3.5 pb-3.5 bg-white">
            <div className="flex flex-col gap-2">
              {entries.map(([key, value], index) => (
                <div key={index} className="flex flex-col gap-1">
                  {isObject(value) || isArray(value) ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-foreground">Key</span>
                        <span className="text-xs font-normal text-foreground">{key}</span>
                      </div>
                      <NestedDataView data={value} depth={depth + 1} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 p-2 border border-border rounded-[6px]">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">Key</span>
                        <span className="text-sm font-normal text-foreground">{key}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-foreground">Value</span>
                        <span className="text-sm font-normal text-foreground break-all">{formatValue(value)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  if (isArray(data)) {
    return (
      <Accordion type="multiple" className="w-full" defaultValue={depth === 0 ? ['array-root'] : []}>
        <AccordionItem value="array-root" className="border border-border rounded-[6px] overflow-hidden">
          <AccordionTrigger className="px-3.5 py-2.5 hover:no-underline bg-white">
            <span className="text-sm font-medium text-foreground">Array [{data.length}]</span>
          </AccordionTrigger>
          <AccordionContent className="px-3.5 pb-3.5 bg-white">
            <div className="flex flex-col gap-2">
              {data.map((item, index) => (
                <div key={index}>
                  <div className="text-xs font-bold text-muted-foreground mb-1">[{index}]</div>
                  <NestedDataView data={item} depth={depth + 1} />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }

  return <span className="text-sm font-normal text-foreground">{formatValue(data)}</span>;
};

export const Eip712Dialog = ({
  open,
  onOpenChange,
  typedDataJson,
  origin,
  timestamp,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
  canSign,
}: Eip712DialogProps) => {
  const isMobile = useIsMobile();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Parse typed data
  const typedData = useMemo(() => {
    try {
      return JSON.parse(typedDataJson) as TypedData;
    } catch (error) {
      console.error('Failed to parse typed data:', error);
      return null;
    }
  }, [typedDataJson]);

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

  // Get contract address from domain
  const contractAddress = typedData?.domain?.verifyingContract as string | undefined;

  return (
    <DefaultDialog
      open={open}
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
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            Review
          </p>
          <p className="text-xs font-normal leading-[100%] text-foreground">{displayAddress}</p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: '95vh',
        overflowY: 'auto',
      } : {
        width: 'fit-content',
        maxWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        {/* Main Content - Typed Data Tree View */}
        <div className="flex flex-col gap-3">
          {typedData ? (
            <div className="max-h-[400px] overflow-y-auto">
              {/* Combine domain and message into single tree */}
              <NestedDataView
                data={{
                  ...typedData.domain,
                  ...typedData.message
                }}
                depth={0}
              />
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-[6px]">
              <p className="text-sm text-red-600">Failed to parse typed data</p>
            </div>
          )}

          {/* URL and Domain Information */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">URL</p>
              <p className="text-base font-normal leading-[150%] truncate">
                {formatOrigin(origin)}
              </p>
            </div>
            <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
            <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
              <p className="text-xs font-bold leading-[133%]">Domain</p>
              <p className="text-base font-normal leading-[150%] truncate">
                {formatOrigin(origin)}
              </p>
            </div>
          </div>

          {/* Contract Address if available */}
          {contractAddress && (
            <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px]">
              <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                <p className="text-xs font-bold leading-[133%]">Contract</p>
                <p className="text-base font-normal leading-[150%] truncate">
                  {contractAddress}
                </p>
              </div>
              {chainName && (
                <>
                  <div className="w-[1px] rounded-full bg-border h-full flex-shrink-0 min-h-[50px]" />
                  <div className="flex flex-col text-foreground gap-0.5 min-w-0 flex-1">
                    <p className="text-xs font-bold leading-[133%]">Network</p>
                    <div className="flex flex-row items-center gap-1 min-w-0">
                      {chainIcon && <div className="w-4 h-4 flex-shrink-0">{chainIcon}</div>}
                      <p className="text-base font-normal leading-[150%] truncate">{chainName}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Status Message */}
          {signatureStatus && (
            <div className={`text-sm p-3 rounded-lg ${signatureStatus.includes('Error') ? 'bg-red-50 text-red-600' :
              signatureStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
                'bg-blue-50 text-blue-600'
              }`}>
              {signatureStatus}
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
            onClick={onSign}
            disabled={!canSign}
            className="flex-1"
          >
            {isProcessing ? 'Processing...' : 'Transact'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  )
}

export * from './types';
