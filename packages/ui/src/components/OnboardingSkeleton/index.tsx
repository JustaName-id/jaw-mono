'use client';

import { Skeleton } from '../ui/skeleton';
import { DialogShell } from '../DialogShell';

/**
 * Loading placeholder shaped like OnboardingDialog's "Welcome back" view.
 *
 * The embedded (iframe) dialog is revealed the moment the transport handshake
 * acks, which happens before keys knows which screen the flow resolves to:
 * choosing between "Continue as" and account creation needs the handshake
 * account hint resolved against the backend passkey registry, and on a wiped
 * storage partition that is a real roundtrip. Rendering the shape of the card
 * that is about to arrive makes that window read as one continuous screen —
 * bars filling in with content — instead of a separate interstitial.
 *
 * Deliberately renders NO copy: any text here (a caption, a version) becomes a
 * distinct screen the user has to read and dismiss visually. Geometry only.
 *
 * Mirrors the welcome-back tile's own pending state (the `identityPending`
 * branch of OnboardingDialog), so this is the same visual language the card
 * already uses while an identity settles — not a second loading idiom.
 */
export function OnboardingSkeleton() {
  return (
    <DialogShell>
      <div className="flex flex-col p-6">
        {/* "Welcome back." — h2 at 26px/leading-none */}
        <Skeleton className="h-[26px] w-48 rounded" />
        {/* "Pick up where you left off." — `text-body` is 12px x 1.4 = 16.8px, mt-2 */}
        <div className="mt-2 flex h-[17px] items-center">
          <Skeleton className="h-3 w-40 rounded" />
        </div>

        {/* The primary "Continue as" tile. Filled with bg-primary exactly like
            the real one, so the reveal changes content, never the tile itself.
            Inner bars use the primary-foreground tint because the default
            bg-accent token is near-invisible on this tile. */}
        <div className="bg-primary rounded-box mt-6 flex items-center gap-3 p-3">
          <Skeleton className="bg-primary-foreground/10 rounded-box h-10 w-10 flex-none" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* "CONTINUE AS" label */}
            <Skeleton className="bg-primary-foreground/10 h-2 w-16 rounded" />
            {/* account name */}
            <Skeleton className="bg-primary-foreground/10 h-3.5 w-36 rounded" />
          </span>
          {/* trailing chevron */}
          <Skeleton className="bg-primary-foreground/10 h-4 w-4 flex-none rounded" />
        </div>

        {/* The "or" divider, hairline only — its label is text. MonoDivider's
            row is as tall as that label's line box (`text-label`, 10px x 1), not as tall as
            the hairline, so the height is reserved explicitly: without it this
            row swallows the gap and the rows below it ride up. */}
        <div className="my-5 flex h-2.5 items-center gap-3">
          <span className="bg-border h-px flex-1" />
          <span className="bg-border h-px w-4 flex-none" />
          <span className="bg-border h-px flex-1" />
        </div>

        {/* "Switch account" — h-11 secondary button */}
        <Skeleton className="rounded-box h-11 w-full" />
        {/* "Create new account" — centered text-xs link. h-4, NOT 12 x 1.5:
            Tailwind's named sizes ship their own line-height (text-xs is
            12px/16px), so only the arbitrary sizes above inherit the 1.5. */}
        <div className="mt-4 flex h-4 items-center justify-center">
          <Skeleton className="h-3 w-28 rounded" />
        </div>
      </div>
    </DialogShell>
  );
}
