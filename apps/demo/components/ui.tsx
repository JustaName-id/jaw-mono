'use client';

// Shared primitives for the demo: the icon set and the two pill-button styles
// used across the page chrome, the mobile menu, and the finale sheet.

type IconProps = { size?: number };

export const Icon = {
  Arrow: ({ size = 14 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  ),
  ArrowUR: ({ size = 14 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  ),
  Check: ({ size = 12 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  // Placeholder brand mark (the design uses assets/brand-mark.png).
  Logo: ({ size = 22 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="JAW.id" className="block">
      <rect width="24" height="24" rx="6" fill="var(--jaw-blue)" />
      <path
        d="M8 12.2 10.6 15 16.4 9"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export const btnPrimary =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-acc bg-acc px-[18px] py-3 text-[13.5px] font-medium tracking-[-0.005em] text-paper no-underline transition-all duration-200 hover:-translate-y-px hover:bg-acc-deep hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,.4)] disabled:translate-y-0 disabled:cursor-default disabled:opacity-55 disabled:shadow-none';

export const btnGhost =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-2 bg-transparent px-[18px] py-3 text-[13.5px] font-medium text-ink no-underline transition-all duration-200 hover:border-ink-3 hover:bg-raise-2';
