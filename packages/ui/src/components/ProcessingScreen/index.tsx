import type { ReactNode } from 'react';
import { AccountAvatar } from '../AccountAvatar';

export interface ProcessingScreenProps {
  /** Signing account — seeds the identicon / shows the ENS avatar. */
  seedAddress: string;
  /** ENS avatar URL, if resolved. */
  avatarUrl?: string | null;
  /** The dApp's avatar node (logo image or fallback icon), shown as the flow target. */
  appAvatar: ReactNode;
  /** Headline, e.g. "Signing…", "Connecting…", "Sending…". */
  title: string;
  /** Optional sub-line, e.g. "Confirm with your passkey". */
  subtitle?: string;
}

/**
 * The in-progress beat shared by every dialog: the account identity flows (animated
 * dots) toward the dApp, under a title/subtitle. One component so "Signing…",
 * "Connecting…", "Sending…" all look and animate identically across screens.
 */
export function ProcessingScreen({ seedAddress, avatarUrl, appAvatar, title, subtitle }: ProcessingScreenProps) {
  return (
    <div className="flex min-h-[234px] flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex items-center gap-3">
        {/* Account and app circles flank the flow dots and must stay the same size, so both
            take `size-logo` rather than two independently-written values. */}
        <AccountAvatar seed={seedAddress} avatarUrl={avatarUrl} size={44} className="rounded-box size-logo" />
        <span className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="jaw-flow-dot bg-foreground/70 h-1.5 w-1.5 rounded-full"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
        <span className="bg-secondary border-border size-logo flex items-center justify-center overflow-hidden rounded-full border">
          {appAvatar}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-foreground text-status">{title}</h2>
        {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
