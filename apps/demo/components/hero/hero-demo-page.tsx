'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FEATS, type PhoneAppKey } from './feats';
import { FeatRow } from './feat-row';
import { IOS_BEZEL, IOSDevice } from '@/components/ios/device';
import { btnGhost, btnPrimary, JdIcon } from '@/components/jaw/shared';
import { SocialApp } from '@/components/phone-apps/social';
import { getJaw, prewarmJaw, resetJaw } from '@/lib/jaw';
import { sendSplitsBatch } from '@/lib/requests';
import { useDialogEmbed } from '@/lib/use-dialog-embed';
import { SplitsApp } from '@/components/phone-apps/splits';
import { SwaprApp } from '@/components/phone-apps/swapr';
import { AgensApp } from '@/components/phone-apps/agens';

const BASE_APPS: Record<PhoneAppKey, (props: { onCta: () => void }) => React.ReactElement> = {
  social: ({ onCta }) => <SocialApp onCta={onCta} />,
  splits: ({ onCta }) => <SplitsApp onCta={onCta} />,
  swapr: ({ onCta }) => <SwaprApp onCta={onCta} />,
  swaprsend: ({ onCta }) => <SwaprApp onCta={onCta} sendTo="ghadii.justaname.eth" />,
  agens: ({ onCta }) => <AgensApp onCta={onCta} />,
};

// Screen size of the mock phone; the rendered frame adds the bezel.
const PW = 360;
const PH = 700;
const FRAME_W = PW + IOS_BEZEL * 2;
const FRAME_H = PH + IOS_BEZEL * 2;
// Cap at 1 (native size) so text never upscales blurry; otherwise fill the container.
const MAX_SCALE = 1;
const MIN_SCALE = 0.45;

// Fit the phone to its container width and the viewport height.
function usePhoneScale() {
  const areaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(MAX_SCALE);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    // Width-fit only, no height shrink: the embedded keys iframe renders at
    // native pixels (it cannot be transform-scaled without tripping keys'
    // visibility guard), so any scale < 1 makes the real dialog look oversized
    // next to the scaled-down mock app. Keep the phone at 1:1 whenever the
    // column is wide enough and let the page scroll on short windows.
    const measure = () => {
      const byWidth = el.clientWidth / FRAME_W;
      setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, byWidth)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  return { areaRef, scale };
}

// On phones the visitor's device IS the phone: render the demo full-bleed,
// no frame. Matches Tailwind's md breakpoint.
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

// Staggered fade for the fin sheet's children.
const finFade = 'animate-hd-fin-fade [animation-delay:220ms]';

// Features without a theme of their own reset the dialog to the SDK's light
// defaults, so a themed feature never leaks its palette into the next screen.
const DEFAULT_THEME = { mode: 'light' } as const;

export function HeroDemoPage() {
  const [id, setId] = useState(1);
  const [vi, setVi] = useState(0);
  const [open, setOpen] = useState(false);
  const [fin, setFin] = useState(false);
  const [menu, setMenu] = useState(false);
  const { areaRef, scale } = usePhoneScale();
  const isMobile = useIsMobile();
  // Elements the real keys.jaw.id dialog gets pinned to: the phone screen on
  // desktop, the full-bleed demo area on mobile.
  const [mobileEl, setMobileEl] = useState<HTMLDivElement | null>(null);
  const [screenEl, setScreenEl] = useState<HTMLDivElement | null>(null);
  useDialogEmbed(isMobile ? mobileEl : screenEl, isMobile ? 0 : 47 * scale);
  const cur = FEATS.find((f) => f.id === id) ?? FEATS[0];
  useEffect(() => {
    // Prewarm mounts the hidden keys iframe; the active feature's theme rides
    // the handshake on first load and a live SetTheme push on every switch.
    const provider = prewarmJaw();
    provider?.setTheme(cur.theme ?? DEFAULT_THEME);
  }, [cur]);

  useEffect(() => {
    // Sign in / Sign up always demos a fresh connect. Log out on ENTERING the
    // screen (not on tap): disconnect tears the keys iframe down, and doing it
    // here lets a fresh one prewarm in the background while the user reads the
    // screen — so the tap itself opens the drawer with no teardown lag.
    if (cur.id !== 1) return;
    (async () => {
      const jaw = getJaw();
      if (!jaw) return;
      const accounts = (await jaw.provider.request({ method: 'eth_accounts' })) as string[];
      if (accounts && accounts.length > 0) {
        await jaw.provider.disconnect();
        resetJaw()?.provider.setTheme(cur.theme ?? DEFAULT_THEME);
      }
    })().catch(() => {});
  }, [cur]);

  const v = cur.variants[vi] ?? cur.variants[0];
  const pick = (n: number) => {
    setId(n);
    setVi(0);
    setOpen(false);
    setFin(false);
    setMenu(false);
  };
  const pickVariant = (i: number) => {
    setVi(i);
    setOpen(false);
  };
  // From the in-phone menu: jump straight to a feature + variant.
  const pickFeatVariant = (n: number, i: number) => {
    setId(n);
    setVi(i);
    setOpen(false);
    setFin(false);
    setMenu(false);
  };
  const onDone = () => {
    if (id === FEATS.length) {
      setOpen(false);
      setFin(true);
    } else {
      pick(id + 1);
    }
  };
  const Base = BASE_APPS[v.app || cur.app];

  // Every CTA opens the real keys.jaw.id dialog (contained in the phone).
  // v1 wires connect; per-feature requests (send/swap/delegate) come next.
  const onCta = async () => {
    const jaw = getJaw();
    if (!jaw) return;
    setOpen(true);
    try {
      // eth_accounts is silent + local: it reports the live session without
      // opening the dialog.
      const accounts = (await jaw.provider.request({ method: 'eth_accounts' })) as string[];
      const connected = Boolean(accounts && accounts.length > 0);
      if (cur.id === 1) {
        // Fresh-connect demo. The screen-entry effect normally logged out
        // already; the disconnect here only covers taps that raced it.
        if (connected) {
          await jaw.provider.disconnect();
          resetJaw()?.provider.setTheme(cur.theme ?? DEFAULT_THEME);
        }
        await getJaw()!.provider.request({ method: 'eth_requestAccounts' });
      } else {
        // Other screens reuse the session; connect only if there is none.
        if (!connected) {
          await jaw.provider.request({ method: 'eth_requestAccounts' });
        }
        // Per-feature real request (the dialog shows the actual review).
        if (cur.id === 2) {
          await sendSplitsBatch(jaw.provider);
        }
      }
      onDone();
    } catch {
      // dismissed or rejected — stay on the current feature
    } finally {
      setOpen(false);
    }
  };

  // The demo itself: the fake app plus every overlay (menu, dialog, finale).
  // Rendered once — inside the device frame on desktop, full-bleed on mobile.
  const demo = (
    <div className="animate-jd-fade relative h-full" key={`${id}-${v.key}`}>
      <div className="group/stage h-full" data-pulse={open || fin || menu ? undefined : ''}>
        <Base onCta={onCta} />
      </div>

      {/* mobile-only: feature switcher floats over the app */}
      {!open && !fin && (
        <button
          type="button"
          aria-label="Choose a feature"
          onClick={() => setMenu(true)}
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
      {menu && (
        <div
          className="animate-jd-fade absolute inset-0 z-[55] flex items-end bg-[rgba(15,23,42,.35)] backdrop-blur-[2px] md:hidden"
          onClick={() => setMenu(false)}
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
                const on = id === f.id;
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => pick(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') pick(f.id);
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
                          const vOn = on && i === vi;
                          const danger = fv.key === 'adversarial';
                          return (
                            <button
                              key={fv.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                pickFeatVariant(f.id, i);
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
                Playground <JdIcon.ArrowUR size={10} />
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
                Get Started <JdIcon.Arrow size={12} />
              </a>
              <a href="https://docs.jaw.id" target="_blank" rel="noopener noreferrer" className={btnGhost}>
                Docs <JdIcon.ArrowUR size={11} />
              </a>
            </div>
          </div>
        </div>
      )}

      {fin && (
        <div className="absolute inset-0 z-[60] flex items-end">
          <div className="animate-hd-fin-fade absolute inset-0 bg-[rgba(15,23,42,.4)] backdrop-blur-[3px]" />
          <div className="animate-hd-fin-up relative w-full rounded-t-[26px] bg-white px-6 pb-[34px] pt-[26px] text-center shadow-[0_-24px_60px_-24px_rgba(15,23,42,.5)]">
            <span className={`bg-line-2 mx-auto mb-5 block h-[5px] w-[38px] rounded-full ${finFade}`} />
            <span
              className={`text-jaw-blue mx-auto mb-4 grid h-[52px] w-[52px] place-items-center rounded-full bg-[#EEF3FF] ${finFade}`}
            >
              <JdIcon.Logo size={24} />
            </span>
            <div className={`mb-[7px] text-[20px] font-semibold tracking-[-0.025em] ${finFade}`}>
              One account, any app
            </div>
            <p className={`text-ink-2 mx-auto mb-[22px] max-w-[250px] text-[13.5px] leading-[1.55] ${finFade}`}>
              Four of the things a JAW account can do. The playground has many more, all on the same account.
            </p>
            <div className={`flex flex-col gap-[9px] ${finFade}`}>
              <a
                href="https://dashboard.jaw.id"
                className="bg-ink flex items-center justify-center gap-2 rounded-[14px] px-[18px] py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white no-underline transition-transform duration-150 hover:-translate-y-px"
              >
                Get Started <JdIcon.Arrow size={14} />
              </a>
              <a
                href="https://playground.jaw.id/"
                target="_blank"
                rel="noopener noreferrer"
                className="border-line-2 text-ink flex items-center justify-center gap-2 rounded-[14px] border px-[18px] py-3.5 text-[15px] font-semibold tracking-[-0.01em] no-underline transition-transform duration-150 hover:-translate-y-px"
              >
                See the playground <JdIcon.ArrowUR size={12} />
              </a>
            </div>
            <button
              type="button"
              onClick={() => pick(1)}
              className={`text-ink-2 hover:bg-raise-2 hover:text-ink mt-3.5 flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-colors duration-[180ms] ${finFade}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Run the flows again
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col max-md:h-dvh max-md:min-h-0">
      {/* desktop-only header; on mobile the demo owns the whole screen and
          brand/back-link live in the hamburger menu */}
      <section className="mx-auto w-full max-w-[1400px] px-9 pt-[22px] max-md:hidden">
        <div className="flex items-center justify-between gap-6">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <JdIcon.Logo size={26} />
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
            className="border-line-2 text-ink-2 hover:border-line-2 hover:bg-raise hover:text-ink inline-flex items-center gap-[7px] whitespace-nowrap rounded-full border px-[13px] py-[7px] font-mono text-[10.5px] uppercase tracking-[.1em] no-underline transition-colors duration-200"
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

      {/* mobile: the visitor's phone IS the device — demo runs full-bleed, no frame */}
      <div ref={setMobileEl} className="relative min-h-0 flex-1 overflow-hidden bg-white md:hidden">
        {isMobile && demo}
      </div>

      {/* desktop / tablet: framed phone on the stage */}
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start max-[1040px]:grid-cols-1 max-md:hidden">
        <div className="flex min-h-0 flex-col justify-start py-[26px] pb-10 pl-9 pr-16 max-[1040px]:px-6">
          <h1 className="mb-3 max-w-[24ch] text-balance text-[clamp(26px,2.4vw,34px)] font-semibold leading-[1.06] tracking-[-0.035em]">
            Walk through exactly what <span className="text-jaw-blue">your users</span> do.
          </h1>
          <p className="text-ink-2 mb-[26px] max-w-[600px] text-pretty text-[17px] leading-[1.55]">
            The app builds its own screens. JAW makes the action possible and provides the components users decide on:
            reviews, confirmations, signatures.
          </p>
          <div className="relative mb-8 flex flex-col gap-2">
            {FEATS.map((f) => (
              <FeatRow
                key={f.id}
                f={f}
                on={id === f.id}
                past={f.id < id}
                vi={id === f.id ? vi : 0}
                setVi={pickVariant}
                onPick={() => pick(f.id)}
              />
            ))}
            <a
              className="group relative z-[1] grid cursor-pointer grid-cols-[24px_1fr] items-start gap-[18px] text-inherit no-underline"
              href="https://playground.jaw.id/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="text-ink-4 group-hover:text-jaw-blue pt-[13px] font-mono text-[13px] transition-colors duration-[250ms]">
                +
              </div>
              <div className="border-line group-hover:border-line-2 group-hover:bg-raise rounded-xl border px-4 py-[13px] transition-colors duration-200">
                <div className="flex items-center gap-3">
                  <span className="text-ink-3 group-hover:text-jaw-blue shrink-0 whitespace-nowrap text-[16px] font-medium leading-[1.3] transition-colors duration-[220ms]">
                    Everything else
                  </span>
                  <span className="text-ink-3 group-hover:text-jaw-blue ml-auto inline-flex min-w-0 items-center gap-[5px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] uppercase tracking-[.1em] transition-colors duration-[220ms]">
                    Playground <JdIcon.ArrowUR size={10} />
                  </span>
                </div>
              </div>
            </a>
          </div>
        </div>

        <div className="sticky top-5 mb-7 mr-7 mt-[26px] flex flex-col gap-4 max-[1040px]:static max-[1040px]:mx-6 max-[1040px]:mb-6 max-[1040px]:mt-0">
          <div
            className="bg-raise flex flex-col items-center justify-center rounded-[28px] px-8 py-8"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,.07) 1px, transparent 0)',
              backgroundSize: '22px 22px',
            }}
          >
            <div ref={areaRef} className="flex w-full justify-center">
              <div className="shrink-0" style={{ width: FRAME_W * scale, height: FRAME_H * scale }}>
                <div className="origin-top-left" style={{ transform: `scale(${scale})` }}>
                  <IOSDevice width={PW} height={PH} screenRef={setScreenEl}>
                    {!isMobile && demo}
                  </IOSDevice>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {fin && (
              <span className="animate-jd-fade text-ink-2 text-[14px]">
                Still not convinced? The docs will change that.
              </span>
            )}
            {!fin && (
              <a href="https://dashboard.jaw.id" className={btnPrimary}>
                Get Started <JdIcon.Arrow size={12} />
              </a>
            )}
            <a href="https://docs.jaw.id" target="_blank" rel="noopener noreferrer" className={btnGhost}>
              Docs <JdIcon.ArrowUR size={11} />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
