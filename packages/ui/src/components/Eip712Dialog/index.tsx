"use client";

import { Button } from "../ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { DefaultDialog } from "../DefaultDialog";
import { Eip712DialogProps } from "./types";
import { useIsMobile } from "../../hooks";
import { getJustaNameInstance, getDisplayAddress } from "../../utils";
import { useState, useEffect, useMemo, useRef } from "react";

// EIP-712 TypedData structure
interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isArray = (value: unknown): value is unknown[] => {
  return Array.isArray(value);
};

const getValueColor = (value: unknown): string => {
  if (typeof value === "string") return "text-foreground";
  if (typeof value === "number") return "text-info dark:text-info";
  if (typeof value === "boolean") return "text-info";
  if (value === null || value === undefined) return "text-muted-foreground";
  return "text-foreground";
};

const formatPrimitiveValue = (
  value: unknown,
): { text: string; color: string } => {
  if (value === null) return { text: "null", color: getValueColor(null) };
  if (value === undefined)
    return { text: "undefined", color: getValueColor(undefined) };
  if (typeof value === "boolean")
    return { text: String(value), color: getValueColor(value) };
  if (typeof value === "number")
    return { text: String(value), color: getValueColor(value) };
  if (typeof value === "string")
    return { text: `"${value}"`, color: getValueColor(value) };
  return { text: JSON.stringify(value), color: "text-foreground" };
};

// Component for rendering a single property line
const PropertyLine = ({
  propertyKey,
  value,
  isLast,
  depth,
}: {
  propertyKey: string;
  value: unknown;
  isLast: boolean;
  depth: number;
}) => {
  const formatted = formatPrimitiveValue(value);
  const paddingLeft = depth * 16; // 16px per depth level

  return (
    <div
      className="flex items-start gap-1 py-0.5 font-mono text-sm"
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      <span className="text-muted-foreground">"{propertyKey}":</span>
      <span className={formatted.color}>{formatted.text}</span>
      {!isLast && <span className="text-muted-foreground">,</span>}
    </div>
  );
};

// Recursive component to render nested objects
const NestedDataView = ({
  data,
  depth = 0,
  parentKey,
  isLast = true,
}: {
  data: unknown;
  depth?: number;
  parentKey?: string;
  isLast?: boolean;
}) => {
  const paddingLeft = depth * 16;

  if (isObject(data)) {
    const entries = Object.entries(data);
    const accordionId = `${parentKey || "root"}-${depth}`;

    if (depth === 0) {
      return (
        <div className="w-full font-mono text-sm">
          <div className="flex flex-col">
            {entries.map(([key, value], index) => {
              const isLastEntry = index === entries.length - 1;

              if (isObject(value) || isArray(value)) {
                return (
                  <NestedDataView
                    key={key}
                    data={value}
                    depth={depth + 1}
                    parentKey={key}
                    isLast={isLastEntry}
                  />
                );
              }

              return (
                <PropertyLine
                  key={key}
                  propertyKey={key}
                  value={value}
                  isLast={isLastEntry}
                  depth={depth}
                />
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full font-mono text-sm">
        <Accordion type="multiple" className="w-full" defaultValue={[]}>
          <AccordionItem value={accordionId} className="border-none">
            <div style={{ paddingLeft: `${paddingLeft}px` }}>
              <AccordionTrigger className="py-0.5 hover:no-underline hover:opacity-70 transition-opacity cursor-pointer [&>svg]:hidden group">
                <span className="flex items-center gap-0.5">
                  {parentKey && (
                    <span className="text-muted-foreground">
                      "{parentKey}":
                    </span>
                  )}
                  <span className="text-muted-foreground group-data-[state=closed]:inline hidden">
                    {" {...}"}
                  </span>
                  <span className="text-muted-foreground group-data-[state=open]:inline hidden">
                    {" {"}
                  </span>
                  {!isLast && (
                    <span className="text-muted-foreground group-data-[state=closed]:inline hidden">
                      ,
                    </span>
                  )}
                </span>
              </AccordionTrigger>
            </div>
            <AccordionContent className="pb-0 pt-0">
              <div className="flex flex-col">
                {entries.map(([key, value], index) => {
                  const isLastEntry = index === entries.length - 1;

                  if (isObject(value) || isArray(value)) {
                    return (
                      <NestedDataView
                        key={key}
                        data={value}
                        depth={depth + 1}
                        parentKey={key}
                        isLast={isLastEntry}
                      />
                    );
                  }

                  return (
                    <PropertyLine
                      key={key}
                      propertyKey={key}
                      value={value}
                      isLast={isLastEntry}
                      depth={depth + 1}
                    />
                  );
                })}
                <div
                  className="py-0.5 text-muted-foreground"
                  style={{ paddingLeft: `${paddingLeft}px` }}
                >
                  <span>{"}"}</span>
                  {!isLast && <span>,</span>}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  if (isArray(data)) {
    const accordionId = `${parentKey || "array"}-${depth}`;

    if (depth === 0) {
      return (
        <div className="w-full font-mono text-sm">
          <div className="flex flex-col">
            {data.map((item, index) => {
              const isLastEntry = index === data.length - 1;
              const indexKey = `[${index}]`;

              if (isObject(item) || isArray(item)) {
                return (
                  <div key={index}>
                    <div
                      className="py-0.5 text-muted-foreground font-mono text-sm"
                      style={{ paddingLeft: `${depth * 16}px` }}
                    >
                      {indexKey}:
                    </div>
                    <NestedDataView
                      data={item}
                      depth={depth + 1}
                      isLast={isLastEntry}
                    />
                  </div>
                );
              }

              const formatted = formatPrimitiveValue(item);
              return (
                <div
                  key={index}
                  className="flex items-start gap-1 py-0.5 font-mono text-sm"
                  style={{ paddingLeft: `${depth * 16}px` }}
                >
                  <span className="text-muted-foreground">{indexKey}:</span>
                  <span className={formatted.color}>{formatted.text}</span>
                  {!isLastEntry && (
                    <span className="text-muted-foreground">,</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="w-full font-mono text-sm">
        <Accordion type="multiple" className="w-full" defaultValue={[]}>
          <AccordionItem value={accordionId} className="border-none">
            <div style={{ paddingLeft: `${paddingLeft}px` }}>
              <AccordionTrigger className="py-0.5 hover:no-underline hover:opacity-70 transition-opacity cursor-pointer [&>svg]:hidden group">
                <span className="flex items-center gap-0.5">
                  {parentKey && (
                    <span className="text-muted-foreground">
                      "{parentKey}":
                    </span>
                  )}
                  <span className="text-muted-foreground group-data-[state=closed]:inline hidden">
                    {" [...]"}
                  </span>
                  <span className="text-muted-foreground group-data-[state=open]:inline hidden">
                    {" ["}
                  </span>
                  {!isLast && (
                    <span className="text-muted-foreground group-data-[state=closed]:inline hidden">
                      ,
                    </span>
                  )}
                </span>
              </AccordionTrigger>
            </div>
            <AccordionContent className="pb-0 pt-0">
              <div className="flex flex-col">
                {data.map((item, index) => {
                  const isLastEntry = index === data.length - 1;
                  const indexKey = `[${index}]`;

                  if (isObject(item) || isArray(item)) {
                    return (
                      <div key={index}>
                        <div
                          className="py-0.5 text-muted-foreground font-mono text-sm"
                          style={{ paddingLeft: `${(depth + 1) * 16}px` }}
                        >
                          {indexKey}:
                        </div>
                        <NestedDataView
                          data={item}
                          depth={depth + 2}
                          isLast={isLastEntry}
                        />
                      </div>
                    );
                  }

                  const formatted = formatPrimitiveValue(item);
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-1 py-0.5 font-mono text-sm"
                      style={{ paddingLeft: `${(depth + 1) * 16}px` }}
                    >
                      <span className="text-muted-foreground">{indexKey}:</span>
                      <span className={formatted.color}>{formatted.text}</span>
                      {!isLastEntry && (
                        <span className="text-muted-foreground">,</span>
                      )}
                    </div>
                  );
                })}
                <div
                  className="py-0.5 text-muted-foreground"
                  style={{ paddingLeft: `${paddingLeft}px` }}
                >
                  <span>{"]"}</span>
                  {!isLast && <span>,</span>}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  const formatted = formatPrimitiveValue(data);
  return (
    <div
      className="py-0.5 font-mono text-sm"
      style={{ paddingLeft: `${paddingLeft}px` }}
    >
      <span className={formatted.color}>{formatted.text}</span>
    </div>
  );
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
  mainnetRpcUrl,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
  canSign,
}: Eip712DialogProps) => {
  // Ref for scrollable container
  const scrollableRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Parse typed data
  const typedData = useMemo(() => {
    try {
      return JSON.parse(typedDataJson) as TypedData;
    } catch (error) {
      console.error("Failed to parse typed data:", error);
      return null;
    }
  }, [typedDataJson]);

  // Resolve account address to human-readable name
  useEffect(() => {
    if (accountAddress && chainId) {
      const justaName = getJustaNameInstance(mainnetRpcUrl);
      justaName.subnames
        .reverseResolve({
          address: accountAddress as `0x${string}`,
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
  }, [accountAddress, chainId]);

  // Handle wheel events for smooth scrolling over JSON content
  useEffect(() => {
    if (!open) return;

    let cleanupFn: (() => void) | null = null;

    // Use a small delay to ensure the DOM is ready
    const timer = setTimeout(() => {
      const scrollable = scrollableRef.current;
      if (!scrollable) return;

      const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        scrollable.scrollTop += e.deltaY;
      };

      scrollable.addEventListener("wheel", handleWheel, { passive: false });

      cleanupFn = () => {
        scrollable.removeEventListener("wheel", handleWheel);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cleanupFn) cleanupFn();
    };
  }, [open]);

  // Get display address - use resolved name or formatted address
  const displayAddress = getDisplayAddress(
    resolvedAddress,
    accountAddress || "",
  );

  // Format origin to display only domain (remove protocol)
  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return origin;
    }
  };

  // Get contract address from domain
  const contractAddress = typedData?.domain?.verifyingContract as
    | string
    | undefined;
  const domainName = typedData?.domain?.name as string | undefined;

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
            {timestamp.toLocaleDateString("en-US", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            at{" "}
            {timestamp.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZoneName: "short",
            })}
          </p>
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            Review
          </p>
          <p className="text-xs font-normal leading-[100%] text-foreground">
            {displayAddress}
          </p>
        </div>
      }
      contentStyle={
        isMobile
          ? {
              width: "100%",
              height: "100%",
              maxWidth: "none",
              maxHeight: "none",
              overflowY: "auto",
            }
          : {
              width: "500px",
              minWidth: "500px",
            }
      }
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        {/* Main Content - Typed Data Tree View */}
        <div className="flex flex-col gap-3 max-md:flex-1 max-h-[60vh] overflow-y-auto min-h-0">
          {typedData ? (
            <div
              ref={scrollableRef}
              className="max-h-[50vh] flex flex-1 overflow-y-auto bg-muted/30 dark:bg-muted/10 rounded-[6px] p-3 border border-border"
            >
              {/* Combine domain and message into single tree */}
              <NestedDataView data={typedData} depth={0} />
            </div>
          ) : (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-[6px]">
              <p className="text-sm text-destructive">
                Failed to parse typed data
              </p>
            </div>
          )}

          {/* URL and Domain Information */}
          <div className="flex flex-row justify-between items-center gap-2.5 p-3.5 border border-border rounded-[6px] max-md:mt-auto">
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
                {domainName || formatOrigin(origin)}
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
                      {chainIcon && (
                        <div className="w-6 h-6 flex-shrink-0">{chainIcon}</div>
                      )}
                      <p className="text-base font-normal leading-[150%] truncate">
                        {chainName}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Status Message */}
          {signatureStatus && (
            <div
              className={`text-sm p-3 rounded-lg ${
                signatureStatus.includes("Error")
                  ? "bg-destructive/10 text-destructive"
                  : signatureStatus.includes("successfully")
                    ? "bg-success/10 text-success"
                    : "bg-info/10 text-info"
              }`}
            >
              {signatureStatus}
            </div>
          )}
        </div>

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
          <Button onClick={onSign} disabled={!canSign} className="flex-1">
            {isProcessing ? "Processing..." : "Sign"}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  );
};

export * from "./types";
