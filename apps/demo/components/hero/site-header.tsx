'use client';

import { Icon } from '@/components/ui';

// Desktop-only page header: brand, live badge, back link. On mobile the demo
// owns the whole screen and these live in the hamburger menu instead.
export function SiteHeader() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-9 pt-[22px] max-md:hidden" data-analytics-surface="header">
      <div className="flex items-center justify-between gap-6">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-2">
            <Icon.Logo size={26} />
            <span className="text-[18px] font-semibold tracking-[-0.015em]">
              JAW<span className="text-ink-3">.id</span>
            </span>
          </span>
          <span className="text-ink inline-flex items-center gap-2 font-mono text-[14px] uppercase tracking-[.12em] max-md:hidden">
            <span className="animate-hd-live bg-jaw-blue h-1.5 w-1.5 rounded-full" />
            Interactive demo
          </span>
        </div>
        <a
          href="https://jaw.id"
          className="border-line-2 text-ink-2 hover:bg-raise hover:text-ink inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border px-[13px] py-[7px] font-mono text-[10.5px] uppercase tracking-[.1em] no-underline transition-colors duration-200"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to website
        </a>
      </div>
    </section>
  );
}
