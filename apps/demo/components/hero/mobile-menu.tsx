'use client';

import { FEATS } from './features';
import { btnGhost, btnPrimary, Icon } from '@/components/ui';

// Mobile-only feature switcher: a floating hamburger over the app plus an
// in-phone bottom sheet listing every feature, its variants, and the links
// that live in the desktop header/footer.
export function MobileMenu({
  showButton,
  open,
  onOpen,
  onClose,
  activeId,
  activeVi,
  onPick,
  onPickVariant,
}: {
  showButton: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  activeId: number;
  activeVi: number;
  onPick: (id: number) => void;
  onPickVariant: (id: number, vi: number) => void;
}) {
  return (
    <>
      {/* mobile-only: feature switcher floats over the app */}
      {showButton && (
        <button
          type="button"
          aria-label="Choose a feature"
          onClick={onOpen}
          className="absolute right-3.5 top-3.5 z-[35] grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-black/10 bg-white/75 shadow-[0_2px_10px_rgba(15,23,42,.12)] backdrop-blur-md md:hidden"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink)"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
      )}
      {open && (
        <div
          className="animate-jd-fade absolute inset-0 z-[55] flex items-end bg-[rgba(15,23,42,.35)] backdrop-blur-[2px] md:hidden"
          onClick={onClose}
        >
          <div
            className="max-h-[86%] w-full overflow-y-auto rounded-t-[26px] bg-white px-4 pb-9 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="bg-line-2 mx-auto mb-4 block h-[5px] w-[38px] rounded-full" />
            <div className="text-ink-3 mb-3 px-1 font-mono text-[10px] uppercase tracking-[.12em]">
              Walk through what your users do
            </div>
            <div className="flex flex-col gap-2">
              {FEATS.map((f) => {
                const on = activeId === f.id;
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onPick(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onPick(f.id);
                    }}
                    className={`cursor-pointer rounded-xl border px-3.5 py-3 transition-colors duration-200 ${
                      on ? 'border-ink shadow-[0_1px_0_var(--ink)]' : 'border-line'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`font-mono text-[11px] font-semibold ${on ? 'text-jaw-blue' : 'text-ink-3'}`}>
                        {String(f.id).padStart(2, '0')}
                      </span>
                      <span
                        className={`text-[15px] tracking-[-0.01em] ${on ? 'font-semibold' : 'text-ink-2 font-medium'}`}
                      >
                        {f.title}
                      </span>
                    </div>
                    <div className="text-ink-3 mt-1 pl-[26px] text-[12px]">{f.teaser}</div>
                    {f.variants.length > 1 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-[26px]">
                        {f.variants.map((fv, i) => {
                          const vOn = on && i === activeVi;
                          const danger = fv.key === 'adversarial';
                          return (
                            <button
                              key={fv.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPickVariant(f.id, i);
                              }}
                              className={`cursor-pointer whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[.08em] ${
                                vOn
                                  ? danger
                                    ? 'border-red-line bg-red-bg text-red'
                                    : 'border-jaw-blue text-jaw-blue bg-[rgba(8,81,255,.06)]'
                                  : 'border-line-2 text-ink-3'
                              }`}
                            >
                              {fv.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <a
              href="https://playground.jaw.id/"
              target="_blank"
              rel="noopener noreferrer"
              className="border-line text-ink-3 mt-2 flex items-center justify-between rounded-xl border px-3.5 py-3 text-[14px] font-medium no-underline"
            >
              Everything else
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.1em]">
                Playground <Icon.ArrowUR size={10} />
              </span>
            </a>
            <a
              href="https://jaw.id"
              className="border-line text-ink-3 mt-2 flex items-center justify-between rounded-xl border px-3.5 py-3 text-[14px] font-medium no-underline"
            >
              Back to website
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.1em]">
                jaw.id
                <svg
                  width="11"
                  height="11"
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
              </span>
            </a>
            <div className="mt-4 flex gap-2">
              <a href="https://dashboard.jaw.id" className={`${btnPrimary} flex-1`}>
                Get Started <Icon.Arrow size={12} />
              </a>
              <a href="https://docs.jaw.id" target="_blank" rel="noopener noreferrer" className={btnGhost}>
                Docs <Icon.ArrowUR size={11} />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
