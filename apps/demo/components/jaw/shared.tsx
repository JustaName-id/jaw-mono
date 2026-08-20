'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';

// Recurring chrome as utility-class constants (shared across every scene/dialog).
export const btnPrimary =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-acc bg-acc px-[18px] py-3 text-[13.5px] font-medium tracking-[-0.005em] text-paper no-underline transition-all duration-200 hover:-translate-y-px hover:bg-acc-deep hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,.4)] disabled:translate-y-0 disabled:cursor-default disabled:opacity-55 disabled:shadow-none';

export const btnGhost =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line-2 bg-transparent px-[18px] py-3 text-[13.5px] font-medium text-ink no-underline transition-all duration-200 hover:border-ink-3 hover:bg-raise-2';

export const kicker = 'font-mono text-[10.5px] uppercase tracking-[.14em] text-ink-3';

type IconProps = { size?: number };

export const JdIcon = {
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
  Warn: ({ size = 14 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-px shrink-0"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  Block: ({ size = 14 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  ),
  Copy: ({ size = 12 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  // Placeholder brand mark (design uses assets/brand-mark.png; layout-only for now).
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

export function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`animate-jd-spin inline-block h-3.5 w-3.5 shrink-0 rounded-full border-[1.6px] ${
        light ? 'border-white/35 border-t-white' : 'border-t-ink-2 border-[rgba(15,23,42,.18)]'
      }`}
    />
  );
}

export function Flag({ tone, children }: { tone: 'red' | 'green'; children: ReactNode }) {
  return (
    <span
      className={`rounded-full border px-[7px] py-0.5 font-mono text-[10px] uppercase tracking-[.08em] ${
        tone === 'red' ? 'border-red-line bg-red-bg text-red' : 'text-green border-[#a7f3d0] bg-[#ecfdf5]'
      }`}
    >
      {children}
    </span>
  );
}

// One key/value row inside a dialog's detail card.
export function Field({
  k,
  v,
  vStyle,
  vSans = false,
}: {
  k: ReactNode;
  v: ReactNode;
  vStyle?: CSSProperties;
  vSans?: boolean;
}) {
  return (
    <div className="border-line flex items-baseline justify-between gap-4 border-b py-[9px] text-[13px] last:border-b-0">
      <span className="text-ink-3 shrink-0">{k}</span>
      <span
        className={`text-ink text-right [overflow-wrap:anywhere] ${vSans ? 'font-sans text-[12.5px]' : 'font-mono text-[12px]'}`}
        style={vStyle}
      >
        {v}
      </span>
    </div>
  );
}

export function FaceScan({ done = false, size = 100 }: { done?: boolean; size?: number }) {
  const corners: Array<[number, number, number, number]> = [
    [0, 0, 1, 1],
    [1, 0, -1, 1],
    [1, 1, -1, -1],
    [0, 1, 1, -1],
  ];
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {corners.map(([fx, fy, sx, sy], i) => (
        <span
          key={i}
          className="absolute h-5 w-5 transition-opacity duration-[400ms]"
          style={
            {
              [fx ? 'right' : 'left']: 0,
              [fy ? 'bottom' : 'top']: 0,
              borderTop: sy > 0 ? '2px solid var(--jaw-blue)' : 'none',
              borderBottom: sy < 0 ? '2px solid var(--jaw-blue)' : 'none',
              borderLeft: sx > 0 ? '2px solid var(--jaw-blue)' : 'none',
              borderRight: sx < 0 ? '2px solid var(--jaw-blue)' : 'none',
              borderTopLeftRadius: sx > 0 && sy > 0 ? 6 : 0,
              borderTopRightRadius: sx < 0 && sy > 0 ? 6 : 0,
              borderBottomLeftRadius: sx > 0 && sy < 0 ? 6 : 0,
              borderBottomRightRadius: sx < 0 && sy < 0 ? 6 : 0,
              opacity: done ? 0.35 : 1,
              zIndex: 3,
            } as CSSProperties
          }
        />
      ))}
      <svg
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-3 z-[2] h-[calc(100%-24px)] w-[calc(100%-24px)]"
      >
        {!done && (
          <>
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--jaw-blue)"
              strokeOpacity=".28"
              strokeWidth="1.2"
              strokeDasharray="3 4"
            />
            <circle cx="50" cy="50" r="32" fill="none" stroke="var(--jaw-blue)" strokeWidth="1.4">
              <animate attributeName="r" values="32;44;32" dur="4.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".55;0;.55" dur="4.4s" repeatCount="indefinite" />
            </circle>
            <line x1="20" x2="80" y1="50" y2="50" stroke="var(--jaw-blue)" strokeWidth="1" opacity=".8">
              <animate attributeName="y1" values="22;78;22" dur="4.4s" repeatCount="indefinite" />
              <animate attributeName="y2" values="22;78;22" dur="4.4s" repeatCount="indefinite" />
            </line>
          </>
        )}
        {done && (
          <g className="animate-jd-pop">
            <circle cx="50" cy="50" r="36" fill="rgba(8,81,255,.12)" />
            <path
              d="M36 50 l8 8 l20 -20"
              stroke="var(--jaw-blue)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

// The JAW dialog shell — the exact chrome every scene's dialog renders in.
export function JawDialog({
  children,
  status = 'BASE SEPOLIA',
  statusColor = '#10B981',
  flagged = false,
}: {
  children: ReactNode;
  status?: string;
  statusColor?: string;
  flagged?: boolean;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div
        className={`relative overflow-hidden rounded-[20px] border bg-white transition-[border-color,box-shadow] duration-300 ${
          flagged
            ? 'border-red-line shadow-[0_30px_80px_-36px_rgba(220,38,38,.25),0_1px_0_rgba(15,23,42,.04)]'
            : 'border-line shadow-[0_30px_80px_-36px_rgba(15,23,42,.22),0_1px_0_rgba(15,23,42,.04)]'
        }`}
      >
        <div className="border-line bg-raise flex items-center justify-between border-b px-4 py-3">
          <div className="inline-flex items-center gap-2">
            <JdIcon.Logo size={16} />
            <span className="text-ink-3 font-mono text-[11px] tracking-[.08em]">demo.jaw.id</span>
          </div>
          <div className="text-ink-3 inline-flex items-center gap-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
            <span className="font-mono tracking-[.06em]">{status}</span>
          </div>
        </div>
        <div className="flex min-h-[340px] flex-col justify-center px-6 py-[22px]">{children}</div>
      </div>
    </div>
  );
}

export function CopyRow({ value, sub }: { value: string; sub?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-line bg-raise flex items-center justify-between gap-3 rounded-[10px] border px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-ink overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px]">{value}</div>
        {sub && <div className="text-ink-3 mt-0.5 font-mono text-[10.5px]">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
        className="text-ink-2 inline-flex shrink-0 cursor-pointer items-center gap-1.5 font-mono text-[12px]"
      >
        <JdIcon.Copy />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function Warn({ level = 'amber', children }: { level?: 'amber' | 'red'; children: ReactNode }) {
  return (
    <div
      className={`mb-2 flex items-start gap-[9px] rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-normal ${
        level === 'red' ? 'border-red-line bg-red-bg text-[#991b1b]' : 'border-amber-line bg-amber-bg text-[#92400e]'
      }`}
    >
      {level === 'red' ? <JdIcon.Block /> : <JdIcon.Warn />}
      <span>{children}</span>
    </div>
  );
}

export function DialogTitle({
  kicker: kickerText,
  title,
  right,
}: {
  kicker: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div>
        <div className={`${kicker} mb-1.5`}>{kickerText}</div>
        <div className="text-[17px] font-semibold tracking-[-0.015em]">{title}</div>
      </div>
      {right}
    </div>
  );
}
