'use client';

import Image from 'next/image';

// Shared primitives for the demo: the icon set and the two pill-button styles
// used across the page chrome, the mobile menu, and the finale sheet.

type IconProps = { size?: number };

// Native size of public/jaw-logo.png (same asset as playground and keys);
// width follows the aspect ratio so the mark never squishes.
const LOGO_W = 203;
const LOGO_H = 222;

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
  ChevronL: ({ size = 18 }: IconProps) => (
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  ChevronR: ({ size = 18 }: IconProps) => (
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  Close: ({ size = 17 }: IconProps) => (
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  ),
  Menu: ({ size = 19 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  ),
  // Brand mark, the same asset playground and keys ship.
  Logo: ({ size = 22 }: IconProps) => (
    <Image
      src="/jaw-logo.png"
      alt="JAW.id"
      width={Math.round((size * LOGO_W) / LOGO_H)}
      height={size}
      className="block"
    />
  ),
};

export const btnPrimary =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-acc bg-acc px-[18px] py-3 text-[13.5px] font-medium tracking-[-0.005em] text-paper no-underline transition-all duration-200 hover:-translate-y-px hover:bg-acc-deep hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,.4)] disabled:translate-y-0 disabled:cursor-default disabled:opacity-55 disabled:shadow-none';

export const btnGhost =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-2 bg-transparent px-[18px] py-3 text-[13.5px] font-medium text-ink no-underline transition-all duration-200 hover:border-ink-3 hover:bg-raise-2';
