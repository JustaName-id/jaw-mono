'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FEATS, type PhoneAppKey } from './features';
import { FeatRow } from './feature-row';
import { SiteHeader } from './site-header';
import { MobileMenu } from './mobile-menu';
import { FinSheet } from './fin-sheet';
import { IOS_BEZEL, IOSDevice } from '@/components/ios-device';
import { btnGhost, btnPrimary, Icon } from '@/components/ui';
import { SocialApp } from '@/components/screens/social';
import { getJaw, prewarmJaw, resetJaw } from '@/lib/jaw';
import { sendAgentGrant, sendSplitsBatch, sendSwapBatch } from '@/lib/requests';
import { useEthQuote, type SwapQuote } from '@/lib/use-eth-quote';
import { useDialogEmbed } from '@/lib/use-dialog-embed';
import { SplitsApp } from '@/components/screens/splits';
import { SwapApp } from '@/components/screens/swap';
import { AgentApp } from '@/components/screens/agent';

type BaseAppProps = { onCta: () => void; quote: SwapQuote };

const BASE_APPS: Record<PhoneAppKey, (props: BaseAppProps) => React.ReactElement> = {
  social: ({ onCta }) => <SocialApp onCta={onCta} />,
  splits: ({ onCta }) => <SplitsApp onCta={onCta} />,
  swap: ({ onCta, quote }) => <SwapApp onCta={onCta} quote={quote} />,
  swapSend: ({ onCta, quote }) => <SwapApp onCta={onCta} quote={quote} sendTo="ghadii.justaname.eth" />,
  agent: ({ onCta }) => <AgentApp onCta={onCta} />,
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
  // Live 0.2 USDC → ETH quote for the Swapr screen.
  const quote = useEthQuote(0.2);
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
  // Swapr and Agens screens are dark — flip the status bar / home indicator.
  const activeApp = v.app || cur.app;
  const darkScreen = activeApp.startsWith('swap') || activeApp === 'agent';

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
        if (cur.id === 4) {
          // Real ERC-7715 delegation: 25 USDC/day + 0.01 ETH/month, 30 days.
          await sendAgentGrant(jaw.provider);
        }
        if (cur.id === 3) {
          // Swap 0.2 USDC → WETH on Uniswap v3; the swap output goes back to
          // the connected account, so fetch its address (post-connect too).
          const addrs = (await jaw.provider.request({ method: 'eth_accounts' })) as string[];
          if (addrs?.[0]) {
            await sendSwapBatch(jaw.provider, addrs[0]);
          }
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
        <Base onCta={onCta} quote={quote} />
      </div>

      <MobileMenu
        showButton={!open && !fin}
        open={menu}
        onOpen={() => setMenu(true)}
        onClose={() => setMenu(false)}
        activeId={id}
        activeVi={vi}
        onPick={pick}
        onPickVariant={pickFeatVariant}
      />

      {fin && <FinSheet onRestart={() => pick(1)} />}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col max-md:h-dvh max-md:min-h-0">
      {/* desktop-only header; on mobile the demo owns the whole screen and
          brand/back-link live in the hamburger menu */}
      <SiteHeader />

      {/* mobile: the visitor's phone IS the device — demo runs full-bleed, no frame */}
      <div ref={setMobileEl} className="relative min-h-0 flex-1 overflow-hidden bg-white md:hidden">
        {isMobile && demo}
      </div>

      {/* desktop / tablet: framed phone on the stage */}
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start max-[1040px]:grid-cols-1 max-md:hidden">
        <div className="flex min-h-0 flex-col justify-start py-[26px] pb-10 pl-9 pr-16 max-[1040px]:px-6">
          <h1 className="mb-3 max-w-[24ch] text-balance text-[clamp(26px,2.4vw,34px)] font-semibold leading-[1.06] tracking-[-0.035em]">
            Experience <span className="text-jaw-blue">your user&apos;s</span> journey
          </h1>
          <p className="text-ink-2 mb-[26px] max-w-[600px] text-pretty text-[17px] leading-[1.55]">
            The app builds its own screens. JAW makes the action possible and supplies what users decide on: reviews,
            confirmations, signatures.
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
                    Playground <Icon.ArrowUR size={10} />
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
                  <IOSDevice width={PW} height={PH} dark={darkScreen} screenRef={setScreenEl}>
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
                Get Started <Icon.Arrow size={12} />
              </a>
            )}
            <a href="https://docs.jaw.id" target="_blank" rel="noopener noreferrer" className={btnGhost}>
              Docs <Icon.ArrowUR size={11} />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
