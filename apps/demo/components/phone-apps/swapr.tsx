'use client';

import type { ReactNode } from 'react';
import { ctaInteract } from './chrome';
import { JdIcon } from '@/components/jaw/shared';
import type { SwapQuote } from '@/lib/use-eth-quote';

const pink = 'oklch(0.68 0.24 340)';

// Uniswap-dark palette shared with this feature's dialog theme.
const bg = '#0D0E12';
const tile = '#20242E';
const chip = '#22242C';
const line = '#2B303C';

function UsdcLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="USDC">
      <circle cx="12" cy="12" r="12" fill="#2775CA" />
      <path d="M9.2 3.9a8.6 8.6 0 0 0 0 16.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14.8 3.9a8.6 8.6 0 0 1 0 16.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M14.6 9.2c-.2-1.1-1.1-1.8-2.6-1.8-1.6 0-2.6.8-2.6 2 0 3 5.4 1.4 5.4 4.5 0 1.3-1.1 2.1-2.8 2.1-1.6 0-2.6-.8-2.8-2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 5.4v1.9M12 16.6v1.9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EthLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="WETH">
      <circle cx="12" cy="12" r="12" fill="#627EEA" />
      <path d="M12 3.5v6.3l5 2.3z" fill="#fff" fillOpacity=".6" />
      <path d="M12 3.5 7 12.1l5-2.3z" fill="#fff" />
      <path d="M12 16.4v4.1l5-7z" fill="#fff" fillOpacity=".6" />
      <path d="M12 20.5v-4.1l-5-2.9z" fill="#fff" />
      <path d="m12 15.3 5-3.2-5-2.2z" fill="#fff" fillOpacity=".25" />
      <path d="m7 12.1 5 3.2v-5.4z" fill="#fff" fillOpacity=".55" />
    </svg>
  );
}

function Pill({ sym, icon }: { sym: string; icon: ReactNode }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[7px] rounded-full py-[5px] pl-1.5 pr-[11px] text-[14.5px] font-[650] tracking-[-0.01em] text-slate-100"
      style={{ background: chip, boxShadow: '0 1px 3px rgba(0,0,0,.5)' }}
    >
      {icon}
      {sym}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,.5)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </span>
  );
}

// "Swapr": dark exchange sheet; `sendTo` turns it into the swap-and-send
// variant. `quote` carries the live 0.2 USDC → ETH numbers fetched by the page.
export function SwaprApp({ onCta, sendTo, quote }: { onCta: () => void; sendTo?: string; quote: SwapQuote }) {
  const pad = !sendTo;
  return (
    <div className="flex h-full flex-col overflow-hidden font-sans text-slate-100" style={{ background: bg }}>
      <div className="pt-[58px]">
        <span className="mx-auto block h-1 w-[34px] rounded-full bg-white/20" />
      </div>
      <div className="flex items-center justify-between px-[22px] pb-3 pt-3.5">
        <span className="text-[19px] font-semibold tracking-[-0.02em]">{sendTo ? 'Swap and send' : 'Swap'}</span>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,.5)"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 8h8" />
          <path d="M17 8h3" />
          <circle cx="14.5" cy="8" r="2.5" />
          <path d="M4 16h3" />
          <path d="M12 16h8" />
          <circle cx="9.5" cy="16" r="2.5" />
        </svg>
      </div>
      <div className="px-5">
        <div className="relative">
          <div className="rounded-[18px] px-[17px] py-[15px]" style={{ background: tile }}>
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[29px] font-medium leading-[1.1] tracking-[-0.025em]">{quote.sell}</span>
              <Pill sym="USDC" icon={<UsdcLogo />} />
            </div>
            <div className="mt-[9px] flex items-center justify-between gap-2 whitespace-nowrap text-[12px] text-[rgba(255,255,255,.5)]">
              <span>{quote.usd}</span>
              <span>
                Balance: 40.00{' '}
                <b className="ml-[5px] font-semibold" style={{ color: pink }}>
                  Max
                </b>
              </span>
            </div>
          </div>
          <span
            className="absolute left-1/2 top-1/2 z-[2] grid h-[38px] w-[38px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl text-slate-300"
            style={{ background: line, border: `3px solid ${bg}`, boxShadow: '0 1px 3px rgba(0,0,0,.5)' }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 21V5" />
              <path d="m4 9 4-4 4 4" />
              <path d="M16 3v16" />
              <path d="m20 15-4 4-4-4" />
            </svg>
          </span>
          <div className="mt-[5px] rounded-[18px] px-[17px] py-[15px]" style={{ background: tile }}>
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[29px] font-medium leading-[1.1] tracking-[-0.025em]">{quote.receive}</span>
              <Pill sym="WETH" icon={<EthLogo />} />
            </div>
            <div className="mt-[9px] flex justify-between gap-2 whitespace-nowrap text-[12px] text-[rgba(255,255,255,.5)]">
              <span>{quote.usd}</span>
              <span>Balance: 0.02</span>
            </div>
          </div>
        </div>
        <div
          className="mt-[5px] flex items-center gap-[9px] rounded-xl px-3 py-[9px]"
          style={{ background: 'rgba(255,255,255,.075)' }}
        >
          <span
            className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-slate-300"
            style={{ background: line }}
          >
            i
          </span>
          <span className="text-[12.5px] font-semibold tracking-[-0.01em]">
            {quote.rate} <span className="font-medium text-[rgba(255,255,255,.5)]">({quote.rateUsd})</span>
          </span>
        </div>
      </div>
      {pad ? (
        <div className="grid flex-1 grid-cols-3 content-center gap-y-0.5 px-[30px] py-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => (
            <span
              key={k}
              className="grid h-11 place-items-center text-[23px] font-medium tracking-[-0.01em] text-slate-100"
            >
              {k === 'back' ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,.5)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
              ) : (
                k
              )}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 px-6 pt-3 text-[12.5px] text-[rgba(255,255,255,.5)]">
          <div className="flex justify-between">
            <span>Max slippage</span>
            <span className="font-mono text-[11.5px] text-slate-300">0.5%</span>
          </div>
          <div className="flex justify-between">
            <span>Steps</span>
            <span className="text-[12px] font-semibold text-slate-300">Approve + swap + send</span>
          </div>
          <div
            className="mt-1.5 rounded-2xl px-[15px] py-[13px]"
            style={{ background: tile, border: `1px solid ${line}` }}
          >
            <div className="mb-[9px] flex items-center gap-[7px] text-[11.5px] text-[rgba(255,255,255,.5)]">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
              Then send the WETH to
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="h-[26px] w-[26px] shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' }}
              />
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-100">
                {sendTo}
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-[#3FA968]">
                <JdIcon.Check size={9} />
                Resolved
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="px-5 pb-[46px] pt-2">
        <button
          type="button"
          onClick={onCta}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-full px-5 py-[17px] text-[16.5px] font-[650] tracking-[-0.01em] text-white ${ctaInteract}`}
          style={{ background: pink, boxShadow: `0 12px 28px -12px ${pink.replace(')', ' / .5)')}` }}
        >
          {sendTo ? 'Review swap and send' : 'Review swap'}
        </button>
      </div>
    </div>
  );
}
