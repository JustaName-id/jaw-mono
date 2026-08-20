'use client';

import type { ReactNode } from 'react';
import { JdIcon } from '@/components/jaw/shared';

// Interaction shared by every in-phone CTA: hover lift, and the attention pulse
// while the stage wrapper (group/stage) carries data-pulse (dialog not open yet).
export const ctaInteract =
  'transition-[transform,box-shadow] duration-150 hover:-translate-y-px group-data-[pulse]/stage:animate-hd-pulse';

export function CtaBtn({
  label,
  color = 'var(--ink)',
  onClick,
}: {
  label: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] px-5 py-[15px] text-[15.5px] font-semibold tracking-[-0.01em] text-white ${ctaInteract}`}
      style={{ background: color, boxShadow: '0 12px 28px -12px rgba(15,23,42,.45)' }}
    >
      {label} <JdIcon.Arrow size={14} />
    </button>
  );
}

export const TabIcons: Record<string, ReactNode> = {
  home: <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  swap: (
    <>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </>
  ),
  chart: (
    <>
      <path d="M3 21h18" />
      <path d="M7 17V9" />
      <path d="M12 17V5" />
      <path d="M17 17v-6" />
    </>
  ),
  bag: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="m5.6 5.6 2.8 2.8" />
      <path d="m15.6 15.6 2.8 2.8" />
      <path d="m18.4 5.6-2.8 2.8" />
      <path d="m8.4 15.6-2.8 2.8" />
    </>
  ),
};

export function TabBar({ tabs, accent }: { tabs: Array<[string, string]>; accent: string }) {
  return (
    <div className="border-line flex items-start justify-around border-t bg-white px-2 pb-11 pt-2.5">
      {tabs.map(([icon, label], i) => (
        <span
          key={label}
          className="flex flex-col items-center gap-1"
          style={{ color: i === 0 ? accent : 'var(--ink-4)' }}
        >
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {TabIcons[icon]}
          </svg>
          <span className="text-[9.5px] font-semibold tracking-[.01em]">{label}</span>
        </span>
      ))}
    </div>
  );
}

export function AppHeader({ name, accent, right }: { name: string; accent: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pb-3 pt-[70px]">
      <div className="inline-flex items-center gap-2">
        <span
          className="grid h-[26px] w-[26px] place-items-center rounded-lg text-[13px] font-bold text-white"
          style={{ background: accent }}
        >
          {name[0]}
        </span>
        <span className="text-[16px] font-[650] tracking-[-0.015em]">{name}</span>
      </div>
      {right || (
        <span
          className="border-line h-[30px] w-[30px] rounded-full border"
          style={{ background: 'linear-gradient(135deg,#FDA4AF,#F43F5E)' }}
        />
      )}
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col overflow-hidden bg-white font-sans">{children}</div>;
}
