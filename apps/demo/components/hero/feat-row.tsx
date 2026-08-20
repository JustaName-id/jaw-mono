'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Feat, Variant } from './feats';

export function VariantPills({ variants, vi, setVi }: { variants: Variant[]; vi: number; setVi: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1 pt-3.5">
      {variants.map((v, i) => {
        const on = i === vi;
        const danger = v.key === 'adversarial';
        const tone = on
          ? danger
            ? 'border-red-line bg-red-bg text-red'
            : 'border-jaw-blue bg-[rgba(8,81,255,.06)] text-jaw-blue'
          : 'border-line-2 bg-transparent text-ink-3';
        return (
          <button
            key={v.key}
            type="button"
            className={`cursor-pointer whitespace-nowrap rounded-full border px-[11px] py-[5px] font-mono text-[10px] uppercase tracking-[.1em] transition-all duration-200 ${tone}`}
            onClick={(e) => {
              e.stopPropagation();
              setVi(i);
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

// Height-animated fold. Measures its content and animates the wrapper height.
export function Fold({ open, delay = 0, children }: { open: boolean; delay?: number; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () =>
      setH(Math.ceil(Math.max(el.offsetHeight, el.scrollHeight, el.getBoundingClientRect().height)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (document.fonts?.ready) document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, open]);
  return (
    <div
      className="overflow-hidden [transition:height_.32s_cubic-bezier(.32,.72,0,1)]"
      style={{ height: open ? h : 0 }}
    >
      <div
        ref={inner}
        className={`[display:flow-root] [transition:opacity_.22s_ease,transform_.28s_cubic-bezier(.32,.72,0,1)] ${
          open ? 'opacity-100' : '-translate-y-1 opacity-0'
        }`}
        style={{ transitionDelay: open ? `${delay}ms` : '0ms' }}
      >
        {children}
      </div>
    </div>
  );
}

// One accordion row ("flat" style from the design).
export function FeatRow({
  f,
  on,
  past,
  vi,
  setVi,
  onPick,
}: {
  f: Feat;
  on: boolean;
  past: boolean;
  vi: number;
  setVi: (i: number) => void;
  onPick: () => void;
}) {
  const v = f.variants[on ? vi : 0];
  const label = v.appLabel || f.appLabel;
  const accent = v.accent || f.accent;
  const num = String(f.id).padStart(2, '0');
  return (
    <div
      className="group relative z-[1] grid cursor-pointer grid-cols-[24px_1fr] items-start gap-[18px]"
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onPick();
      }}
    >
      <div
        className={`group-hover:text-jaw-blue pt-3.5 font-mono text-[12px] font-semibold tracking-[.08em] transition-colors duration-[250ms] ${
          on ? 'text-jaw-blue' : past ? 'text-ink-2' : 'text-ink-3'
        }`}
      >
        {num}
      </div>
      <div
        className={`rounded-xl border [transition:background_.2s,border-color_.2s,box-shadow_.2s,padding_.32s_cubic-bezier(.32,.72,0,1)] ${
          on
            ? 'border-ink bg-white px-[18px] pb-[18px] pt-4 shadow-[0_1px_0_var(--ink)]'
            : 'border-line group-hover:border-line-2 group-hover:bg-raise px-4 py-[13px]'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`shrink-0 whitespace-nowrap text-[17.5px] leading-[1.3] tracking-[-0.02em] transition-colors duration-[220ms] ${
              on ? 'text-ink font-semibold' : 'text-ink-2 group-hover:text-ink font-medium'
            }`}
          >
            {f.title}
          </span>
          <span
            className={`text-ink-3 ml-auto inline-flex min-w-0 items-center gap-[7px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] uppercase tracking-[.1em] transition-opacity duration-[250ms] ${
              on ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: accent }} />
            Example: {label}
          </span>
        </div>
        <Fold open={on} delay={70}>
          <p
            key={v.key}
            className="text-ink-2 box-content min-h-[124px] text-pretty pt-2.5 text-[15.5px] leading-[1.6]"
          >
            {v.desc}
          </p>
          {f.variants.length > 1 && <VariantPills variants={f.variants} vi={vi} setVi={setVi} />}
        </Fold>
      </div>
    </div>
  );
}
