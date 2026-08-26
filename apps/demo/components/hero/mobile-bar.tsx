'use client';

import { Icon } from '@/components/ui';

// Mobile-only top bars. On a phone the demo owns the whole screen, so its
// chrome is a real opaque bar with a hairline rule under it — not the floating
// pill + hamburger that used to hover over the app.

export const barShell = 'flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-white px-2.5 md:hidden';

// 36px tap target for the bar's icon slots. Shared so a slot can be a <button>
// or an <a> without the styling drifting between them.
export const barBtn =
  'text-ink grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-150 active:bg-raise disabled:cursor-default disabled:opacity-30 disabled:active:bg-transparent';

const pad = (n: number) => String(n).padStart(2, '0');

// The tour's bar: exit, step counter, the capability on screen, skip, menu.
// `hidden` uses visibility (not unmount) so opening a dialog cannot reflow the
// app underneath it — and so the buttons leave the tab order with it.
export function MobileTourBar({
  step,
  total,
  title,
  hidden,
  atLast,
  onExit,
  onNext,
  onMenu,
}: {
  step: number;
  total: number;
  title: string;
  hidden: boolean;
  atLast: boolean;
  onExit: () => void;
  onNext: () => void;
  onMenu: () => void;
}) {
  return (
    <div
      className={`${barShell} transition-opacity duration-200 ${hidden ? 'invisible opacity-0' : 'opacity-100'}`}
      data-analytics-surface="header"
    >
      <button type="button" aria-label="Exit the demo" onClick={onExit} className={barBtn}>
        <Icon.Close size={17} />
      </button>
      <span className="shrink-0 font-mono text-[11.5px] tracking-[.04em]">
        <span className="text-jaw-blue font-medium">{pad(step)}</span>
        <span className="text-ink-3">/{pad(total)}</span>
      </span>
      <span className="text-ink min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.015em]">{title}</span>
      <button
        type="button"
        aria-label="Next capability"
        onClick={onNext}
        disabled={atLast}
        className={barBtn}
        title={atLast ? undefined : 'Skip ahead'}
      >
        <Icon.ChevronR size={18} />
      </button>
      <button type="button" aria-label="Choose a capability" onClick={onMenu} className={barBtn}>
        <Icon.Menu size={19} />
      </button>
    </div>
  );
}

// The intro's bar: back to the website, the brand, the live badge, the menu.
export function MobileIntroBar({ onMenu }: { onMenu: () => void }) {
  return (
    <div className={`${barShell} sticky top-0 z-[20]`}>
      <a href="https://jaw.id" aria-label="Back to jaw.id" className={barBtn}>
        <Icon.ChevronL size={18} />
      </a>
      <span className="flex min-w-0 items-center gap-3">
        <Icon.Logo size={22} />
        <span className="bg-line-2 h-[15px] w-px shrink-0" />
        <span className="text-ink-2 inline-flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em]">
          <span className="animate-hd-live bg-jaw-blue h-1.5 w-1.5 shrink-0 rounded-full" />
          <span className="truncate">Interactive demo</span>
        </span>
      </span>
      <button type="button" aria-label="Choose a capability" onClick={onMenu} className={`${barBtn} ml-auto`}>
        <Icon.Menu size={19} />
      </button>
    </div>
  );
}
