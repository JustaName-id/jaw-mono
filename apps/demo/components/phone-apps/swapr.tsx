'use client';

import { ctaInteract, Screen } from './chrome';
import { JdIcon } from '@/components/jaw/shared';

const pink = 'oklch(0.68 0.24 340)';

function Pill({ sym, dot }: { sym: string; dot: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[7px] rounded-full bg-white py-[5px] pl-1.5 pr-[11px] text-[14.5px] font-[650] tracking-[-0.01em]"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,.12)' }}
    >
      <span className="h-[22px] w-[22px] rounded-full" style={{ background: dot }} />
      {sym}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </span>
  );
}

// "Swapr": swap sheet; `sendTo` turns it into the swap-and-send variant.
export function SwaprApp({ onCta, sendTo }: { onCta: () => void; sendTo?: string }) {
  const pad = !sendTo;
  return (
    <Screen>
      <div className="pt-[58px]">
        <span className="bg-line-2 mx-auto block h-1 w-[34px] rounded-full" />
      </div>
      <div className="flex items-center justify-between px-[22px] pb-3 pt-3.5">
        <span className="text-[19px] font-semibold tracking-[-0.02em]">{sendTo ? 'Swap and send' : 'Swap'}</span>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
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
          <div className="bg-raise-2 rounded-[18px] px-[17px] py-[15px]">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[29px] font-medium leading-[1.1] tracking-[-0.025em]">
                25.00
                <span className="animate-sw-blink bg-ink ml-0.5 inline-block h-[25px] w-0.5 align-[-4px]" />
              </span>
              <Pill sym="USDC" dot="#2775CA" />
            </div>
            <div className="text-ink-3 mt-[9px] flex items-center justify-between gap-2 whitespace-nowrap text-[12px]">
              <span>$25.00</span>
              <span>
                Balance: 40.00{' '}
                <b className="ml-[5px] font-semibold" style={{ color: pink }}>
                  Max
                </b>
              </span>
            </div>
          </div>
          <span
            className="text-ink-2 absolute left-1/2 top-1/2 z-[2] grid h-[38px] w-[38px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border-[3px] border-white bg-white"
            style={{ boxShadow: '0 1px 3px rgba(15,23,42,.14)' }}
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
          <div className="bg-raise-2 mt-[5px] rounded-[18px] px-[17px] py-[15px]">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-[29px] font-medium leading-[1.1] tracking-[-0.025em]">0.0081</span>
              <Pill sym="ETH" dot="#627EEA" />
            </div>
            <div className="text-ink-3 mt-[9px] flex justify-between gap-2 whitespace-nowrap text-[12px]">
              <span>$24.97</span>
              <span>Balance: 0.02</span>
            </div>
          </div>
        </div>
        <div className="bg-raise mt-[5px] flex items-center gap-[9px] rounded-xl px-3 py-[9px]">
          <span className="bg-line text-ink-2 grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full text-[10px] font-bold">
            i
          </span>
          <span className="text-[12.5px] font-semibold tracking-[-0.01em]">
            1 ETH = 3,086 USDC <span className="text-ink-3 font-medium">($3,088.20)</span>
          </span>
        </div>
      </div>
      {pad ? (
        <div className="grid flex-1 grid-cols-3 content-center gap-y-0.5 px-[30px] py-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => (
            <span key={k} className="text-ink grid h-11 place-items-center text-[23px] font-medium tracking-[-0.01em]">
              {k === 'back' ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink-3)"
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
        <div className="text-ink-3 flex flex-1 flex-col gap-2 px-6 pt-3 text-[12.5px]">
          <div className="flex justify-between">
            <span>Max slippage</span>
            <span className="text-ink-2 font-mono text-[11.5px]">0.5%</span>
          </div>
          <div className="flex justify-between">
            <span>Steps</span>
            <span className="text-ink-2 text-[12px] font-semibold">Approve + swap + send</span>
          </div>
          <div className="border-ink mt-1.5 rounded-2xl border bg-white px-[15px] py-[13px]">
            <div className="text-ink-3 mb-[9px] flex items-center gap-[7px] text-[11.5px]">
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
              Then send the ETH to
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="h-[26px] w-[26px] shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' }}
              />
              <span className="text-ink overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12.5px] font-semibold">
                {sendTo}
              </span>
              <span className="text-green ml-auto inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold">
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
    </Screen>
  );
}
