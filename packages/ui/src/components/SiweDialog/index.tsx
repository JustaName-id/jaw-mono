'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { DefaultDialog } from '../DefaultDialog';
import { DialogShell } from '../DialogShell';
import { DialogAppHeader } from '../DialogAppHeader';
import { AccountPill } from '../AccountPill';
import { AccountIdenticon } from '../AccountIdenticon';
import { IdentityAvatar } from '../IdentityAvatar';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { SiweDialogProps } from './types';
import { SUPPORTED_CHAINS } from '@jaw.id/core';
import { useReverseIdentity } from '../../hooks/useReverseIdentity';
import { parseSiweMessage } from '../../utils/siwe';
import { formatAddress } from '../../utils/formatAddress';
import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { Globe, TriangleAlert } from 'lucide-react';

/** One label/value row in the parsed-fields box. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-foreground/[0.06] flex items-center justify-between gap-2.5 border-t px-[11.5px] py-[8.5px] first:border-t-0">
      <span className="text-muted-foreground flex-none font-mono text-[8px] font-semibold uppercase tracking-[0.13em]">
        {label}
      </span>
      <span className="text-foreground min-w-0 break-all text-right font-mono text-[10px] font-medium">{value}</span>
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
  // Effective account: the passed signer, else the address declared in the message.
  const signerAddress = accountAddress || parsed?.address || '';
  // Resolve the account actually being shown (not just the prop), so the pill's ENS
  // name still appears when the address comes from the SIWE message body.
  const { name: resolvedName, avatar: avatarUrl } = useReverseIdentity(
    signerAddress || undefined,
    chainId,
    mainnetRpcUrl
  );
  const displayName = resolvedName || formatAddress(signerAddress);
  const safeAppName = sanitizeDisplayName(appName) || 'dApp';
  const hasError = siweStatus.includes('Error');

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
  const fields: Array<{ label: string; value: string }> = [];
  if (parsed) {
    // Full address (not truncated): the pill above already shows the friendly ENS
    // name, so this row is the exact, verifiable account being attested.
    const account = parsed.address || accountAddress;
    if (account) fields.push({ label: 'Account', value: account });
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
  }

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      contentStyle={{ width: 'fit-content', background: 'transparent', border: 'none', boxShadow: 'none' }}
      innerStyle={{ padding: 0, overflow: 'visible' }}
    >
      <DialogShell contentClassName="min-h-[510px]">
        {isProcessing ? (
          <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex items-center gap-3">
              <IdentityAvatar
                src={avatarUrl ?? undefined}
                className="h-11 w-11 rounded-[13px]"
                fallback={<AccountIdenticon seed={signerAddress.toLowerCase()} size={44} />}
              />
              <span className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="jaw-flow-dot bg-foreground/70 h-1.5 w-1.5 rounded-full"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </span>
              <span className="bg-secondary border-border flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border">
                {appAvatar}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-foreground text-[15px] font-semibold tracking-[-0.02em]">Signing in...</h2>
              <p className="text-muted-foreground text-xs">Confirm with your passkey</p>
            </div>
          </div>
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-base font-semibold tracking-[-0.02em]">Sign In as</h2>
                <AccountPill seedAddress={signerAddress} label={displayName} avatarUrl={avatarUrl} />
              </div>
              <p className="text-muted-foreground mt-2 pl-2.5 text-[10px] leading-[1.5]">
                A site wants you to sign in to prove you own this account.
              </p>
            </div>

            {/* Scrollable content (block layout so children overflow, not shrink). */}
            <div ref={scrollRef} className="jaw-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 pb-2.5 pt-3">
              {fields.length > 0 ? (
                <div className="border-border overflow-hidden rounded-[10.5px] border">
                  {fields.map((f) => (
                    <Field key={f.label} label={f.label} value={f.value} />
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
      </DialogShell>
    </DefaultDialog>
  );
};

export * from './types';
