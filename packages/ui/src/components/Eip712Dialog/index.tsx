'use client';

import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { SuccessCheck } from '../SuccessCheck';
import { Eip712Tree } from './Eip712Tree';
import { Eip712DomainCard } from './Eip712DomainCard';
import { Button } from '../ui/button';
import { Eip712DialogProps } from './types';
import { useClearSigningTypedData } from '../../hooks';
import { ClearSignedView } from '../TransactionDialog/ClearSignedView';
import { Eip712VerificationDigests } from '../VerificationDigest';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { useEffect, useMemo, useRef } from 'react';
import { Globe } from 'lucide-react';

// EIP-712 TypedData structure
interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

export const Eip712Dialog = ({
  open,
  onOpenChange,
  typedDataJson,
  origin,
  appName,
  appLogoUrl,
  chainName,
  chainId,
  chainIcon,
  mainnetRpcUrl,
  onSign,
  onCancel,
  isProcessing,
  isSuccess,
  signatureStatus,
  canSign,
}: Eip712DialogProps) => {
  // Parse typed data
  const typedData = useMemo(() => {
    try {
      return JSON.parse(typedDataJson) as TypedData;
    } catch (error) {
      console.error('Failed to parse typed data:', error);
      return null;
    }
  }, [typedDataJson]);

  // Extract apiKey from the mainnet RPC URL so the clear-signing hook can authenticate
  // its token-info reads on the target chain.
  const apiKey = useMemo(() => {
    try {
      return new URL(mainnetRpcUrl).searchParams.get('api-key') ?? undefined;
    } catch {
      return undefined;
    }
  }, [mainnetRpcUrl]);

  const { display: clearSigned } = useClearSigningTypedData(typedDataJson, chainId ?? 1, apiKey);

  // Inside a Radix modal, native wheel/trackpad scrolling of a nested overflow
  // container can get eaten. Drive scrollTop manually so the content region always
  // scrolls. (Restored from the pre-revamp dialog.)
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight) return;
      el.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, isProcessing, isSuccess, clearSigned]);

  const hasError = signatureStatus.includes('Error');
  const safeAppName = sanitizeDisplayName(appName ?? '') || 'dApp';

  // Domain the signature is bound to (which contract accepts it, on which chain).
  const domainName = typedData?.domain?.name as string | undefined;
  const verifyingContract = typedData?.domain?.verifyingContract as string | undefined;
  const domainChainId = useMemo(() => {
    const raw = typedData?.domain?.chainId;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'bigint') return Number(raw);
    if (typeof raw === 'string' && raw.length > 0) {
      const n = raw.startsWith('0x') ? Number.parseInt(raw, 16) : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }, [typedData]);

  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img
      src={appLogoUrl ?? undefined}
      alt={`${safeAppName} logo`}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />
  );

  const rawTree = typedData ? <Eip712Tree typedData={typedData} /> : null;

  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing} contentClassName="min-h-[510px]">
      {isSuccess ? (
        // Brief success beat before the parent closes the dialog.
        <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <SuccessCheck size={52} />
          <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Signed</h2>
        </div>
      ) : isProcessing ? (
        // Signing in progress — passkey ceremony running.
        <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="flex items-center gap-3">
            <span className="bg-secondary border-border flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border">
              {appAvatar}
            </span>
            <span className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="jaw-flow-dot bg-foreground/70 h-1.5 w-1.5 rounded-full"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Signing...</h2>
            <p className="text-muted-foreground text-xs">Confirm with your passkey</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Pinned header */}
          <div className="flex-none px-6 pt-7">
            <DialogAppHeader
              appName={appName}
              appLogoUrl={appLogoUrl}
              origin={origin}
              chainName={chainName}
              chainIcon={chainIcon}
            />
            <h2 className="text-foreground mt-4 pl-2.5 text-[17px] font-medium tracking-[-0.03em]">You are signing</h2>
          </div>

          {/* Scrollable content. Block layout (not flex-col) is deliberate: a flex
                column shrinks its children to fit instead of letting them overflow, so
                the region would never scroll. space-y gives the gaps. */}
          <div ref={scrollRef} className="jaw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 pb-2.5 pt-2.5">
            {!typedData ? (
              <div className="bg-destructive/10 border-destructive/20 rounded-[10.5px] border p-4">
                <p className="text-destructive text-sm">Failed to parse typed data</p>
              </div>
            ) : clearSigned && clearSigned.rows.length > 0 ? (
              <>
                <ClearSignedView display={clearSigned} chainId={chainId ?? 1} mainnetRpcUrl={mainnetRpcUrl} />
                <details className="text-xs">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                    Show raw details
                  </summary>
                  <div className="mt-2">{rawTree}</div>
                </details>
              </>
            ) : (
              rawTree
            )}

            {/* Where the signature goes — verifying contract + the domain's network. */}
            {typedData && (
              <Eip712DomainCard
                domainName={domainName}
                verifyingContract={verifyingContract}
                chainId={domainChainId}
                apiKey={apiKey}
              />
            )}

            {/* ERC-8213 verification digests — only when typed data parsed. */}
            {typedData && <Eip712VerificationDigests typedDataJson={typedDataJson} />}

            {hasError && (
              <div className="bg-destructive/10 border-destructive/20 rounded-[10.5px] border px-3 py-2">
                <span className="text-destructive break-words text-xs">{signatureStatus}</span>
              </div>
            )}
          </div>

          {/* Pinned actions */}
          <div className="border-border flex-none border-t px-6 py-3.5">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={onCancel}
                disabled={isProcessing}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Cancel
              </Button>
              <Button
                onClick={onSign}
                disabled={!canSign}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Sign
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  );
};

export * from './types';
