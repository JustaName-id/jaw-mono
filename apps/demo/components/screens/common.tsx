'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';

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
      {label} <Icon.Arrow size={14} />
    </button>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col overflow-hidden bg-white font-sans">{children}</div>;
}
