'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ShellDialog } from '../ShellDialog';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountHeaderRow } from '../AccountHeaderRow';
import { ProcessingScreen } from '../ProcessingScreen';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { SiweDialogProps } from './types';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { parseSiweMessage } from '../../utils/siwe';
import { formatAddress } from '../../utils/formatAddress';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { CopyIcon, CopiedIcon } from '../../icons';
import { Globe, TriangleAlert } from 'lucide-react';

/** One label/value row. Pass `copyValue` to append a copy button (copies the full value). */
function Field({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (!copyValue || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(copyValue)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div className="border-foreground/[0.06] flex items-center justify-between gap-2.5 border-t px-[11.5px] py-[8.5px] first:border-t-0">
      <span className="text-muted-foreground flex-none font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
        {label}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="text-foreground min-w-0 break-all text-right font-mono text-[10px] font-medium">{value}</span>
        {copyValue &&
          (copied ? (
            <CopiedIcon className="size-3 flex-none" />
          ) : (
            <CopyIcon className="size-3 flex-none cursor-pointer" onClick={onCopy} />
          ))}
      </span>
    </div>
  );
}

export const SiweDialog = ({
  open,
  onOpenChange,
  message,
  origin,
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
  const parsed = useMemo(() => parseSiweMessage(message), [message]);
  // The account being attested is the one DECLARED IN THE SIWE MESSAGE, not the
  // wallet's connected account. Prefer the message address so the pill + account row
  // (and their reverse resolution) describe what's actually being signed.
  const signerAddress = parsed?.address || accountAddress || '';
  const { name: resolvedName, avatar: avatarUrl } = useReverseIdentity(
    signerAddress || undefined,
    chainId,
    mainnetRpcUrl
  );
  const displayName = resolvedName || formatAddress(signerAddress);
  const safeAppName = sanitizeDisplayName(appName) || 'dApp';
  const hasError = siweStatus.includes('Error');

  // The message names an account; the signature is produced by the connected
  // account. If they differ, the signature won't verify for the named account —
  // surface it (advisory, not a hard gate).
  const addressMismatch =
    !!accountAddress && !!parsed?.address && accountAddress.toLowerCase() !== parsed.address.toLowerCase();

  // Require a fresh acknowledgement of the phishing warning for every request.
  const ackId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setAcknowledged(false);
  }, [message, warningMessage]);

  // Radix modal eats native wheel scroll of a nested container — drive it manually.
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
  }, [open, isProcessing, parsed]);

  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img src={appLogoUrl} alt={`${safeAppName} logo`} className="h-full w-full rounded-full object-cover" />
  ) : (
    <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />
  );

  // Parsed SIWE fields → the row-wise box (only rows with a value).
  const fields: Array<{ label: string; value: string; copyValue?: string }> = [];
  if (parsed) {
    // Account: show the reverse-resolved name when we have one, else the truncated
    // address. Either way expose a copy button for the full address.
    const account = parsed.address || accountAddress;
    if (account) fields.push({ label: 'Account', value: resolvedName || formatAddress(account), copyValue: account });
    if (parsed.uri) fields.push({ label: 'URL', value: parsed.uri });
    if (parsed.version) fields.push({ label: 'Version', value: parsed.version });
    if (parsed.chainId) {
      // Resolve the name from the MESSAGE's chainId (what's being signed), not the
      // connected chain — otherwise "Chain ID: 1" wrongly reads as the wallet's chain.
      const name = SUPPORTED_CHAINS.find((c) => c.id === parsed.chainId)?.name;
      fields.push({ label: 'Chain ID', value: name ? `${parsed.chainId} · ${name}` : String(parsed.chainId) });
    }
    if (parsed.nonce) fields.push({ label: 'Nonce', value: parsed.nonce });
    if (parsed.issuedAt) fields.push({ label: 'Issued at', value: parsed.issuedAt });
    // Surface validity window — a long/absent expiry on a capability grant is
    // exactly what a user must be able to see before signing.
    if (parsed.expirationTime) fields.push({ label: 'Expires', value: parsed.expirationTime });
    if (parsed.notBefore) fields.push({ label: 'Not before', value: parsed.notBefore });
  }

  return (
    <ShellDialog open={open} onOpenChange={onOpenChange} dismissable={!isProcessing} contentClassName="min-h-[510px]">
      {isProcessing ? (
        <ProcessingScreen
          seedAddress={signerAddress}
          avatarUrl={avatarUrl}
          appAvatar={appAvatar}
          title="Signing in..."
          subtitle="Confirm with your passkey"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Pinned header */}
          <div className="flex-none px-6 pt-6">
            <DialogAppHeader
              appName={appName}
              appLogoUrl={appLogoUrl}
              origin={origin}
              chainName={chainName}
              chainIcon={chainIcon}
            />
            <AccountHeaderRow
              label="Sign In as"
              seedAddress={signerAddress}
              displayName={displayName}
              avatarUrl={avatarUrl}
            />
            {/* The EIP-4361 statement is the actual consent text — show it verbatim
                (readable, not muted) when present; fall back to a generic line. */}
            {parsed?.statement ? (
              <p className="text-foreground mt-2 pl-2.5 text-[11px] leading-[1.5]">{parsed.statement}</p>
            ) : (
              <p className="text-muted-foreground mt-2 pl-2.5 text-[10px] leading-[1.5]">
                A site wants you to sign in to prove you own this account.
              </p>
            )}
          </div>

          {/* Scrollable content (block layout so children overflow, not shrink). */}
          <div ref={scrollRef} className="jaw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 pb-2.5 pt-3">
            {fields.length > 0 ? (
              <div className="border-border overflow-hidden rounded-[10.5px] border">
                {fields.map((f) => (
                  <Field key={f.label} label={f.label} value={f.value} copyValue={f.copyValue} />
                ))}
              </div>
            ) : (
              // Fallback: message didn't parse as SIWE — show it raw.
              <div className="border-border rounded-[10.5px] border p-3">
                <p className="text-foreground whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.6]">
                  {message || 'No message provided'}
                </p>
              </div>
            )}

            {/* Resources — ReCap/EIP-5573 capability grants the signature authorizes.
                Security-relevant, so listed explicitly rather than hidden. */}
            {parsed?.resources && parsed.resources.length > 0 && (
              <div className="border-border rounded-[10.5px] border p-3">
                <span className="text-muted-foreground font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
                  Resources
                </span>
                <div className="mt-1.5 flex flex-col gap-1">
                  {parsed.resources.map((r, i) => (
                    <span key={i} className="text-foreground break-all font-mono text-[10px] leading-[1.5]">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Raw message under a disclosure (canvas: "Message text"). */}
            {fields.length > 0 && (
              <details className="border-border group overflow-hidden rounded-[8.5px] border [&_summary::-webkit-details-marker]:hidden">
                <summary className="hover:bg-foreground/[0.03] flex cursor-pointer list-none items-center justify-between px-3 py-2">
                  <span className="text-muted-foreground text-[11px] font-medium">Message text</span>
                  <svg
                    className="text-muted-foreground h-3 w-3 transition-transform group-open:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="border-border border-t p-3">
                  <p className="text-muted-foreground whitespace-pre-wrap break-words font-mono text-[9px] leading-[1.6]">
                    {message}
                  </p>
                </div>
              </details>
            )}

            {hasError && (
              <div className="bg-destructive/10 border-destructive/20 rounded-[10.5px] border px-3 py-2">
                <span className="text-destructive break-words text-xs">{siweStatus}</span>
              </div>
            )}

            {/* Advisory: message account ≠ connected account. */}
            {addressMismatch && (
              <div className="border-destructive/30 bg-destructive/10 flex items-start gap-2 rounded-[10.5px] border p-3">
                <TriangleAlert className="text-destructive mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
                <p className="text-destructive min-w-0 text-[11px] leading-[1.45]">
                  This request names a different account than the one you're connected with, so the signature won't be
                  valid for it.
                </p>
              </div>
            )}

            {/* Phishing warning + acknowledgement gate (error state). In the scroll
                  flow — below the expandable message, not pinned over it. */}
            {warningMessage && (
              <div className="border-destructive/30 bg-destructive/10 rounded-[10.5px] border p-3">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="text-destructive mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
                  <p className="text-destructive min-w-0 text-[11px] leading-[1.45]">{warningMessage}</p>
                </div>
                <label htmlFor={ackId} className="mt-2.5 flex cursor-pointer items-center gap-2">
                  <Checkbox
                    id={ackId}
                    checked={acknowledged}
                    onCheckedChange={(checked) => setAcknowledged(checked === true)}
                  />
                  <span className="text-destructive text-[11px] font-medium">I accept the risk</span>
                </label>
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
                disabled={!canSign || (!!warningMessage && !acknowledged)}
                className="h-11 flex-1 rounded-[10.5px] text-[13px] font-semibold focus-visible:ring-1"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShellDialog>
  );
};

export * from './types';
