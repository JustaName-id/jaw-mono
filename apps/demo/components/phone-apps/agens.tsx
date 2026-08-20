'use client';

import { ctaInteract, Screen } from './chrome';
import { JdIcon } from '@/components/jaw/shared';

// "Agens": AI agent chat asking for a spending permission.
export function AgensApp({ onCta }: { onCta: () => void }) {
  return (
    <Screen>
      <div className="border-line flex items-center gap-2.5 border-b px-5 pb-3 pt-[70px]">
        <span
          className="relative grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-[14px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#0F172A,#475569)' }}
        >
          A
          <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white bg-[#10B981]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-[650]">Agens</div>
          <div className="text-ink-3 font-mono text-[10px]">agens.justan.id · online</div>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </div>
      <div className="bg-raise flex flex-1 flex-col justify-end gap-2.5 px-[18px] py-4">
        <div className="text-ink-4 mb-0.5 text-center font-mono text-[9.5px] tracking-[.08em]">TODAY · 9:41 AM</div>
        <div
          className="max-w-[82%] self-end rounded-[16px_16px_4px_16px] px-3.5 py-2.5 text-[13.5px] leading-normal text-white"
          style={{ background: 'rgb(8,81,255)' }}
        >
          Watch the market dataset and buy it whenever it drops under $2.
        </div>
        <div className="border-line max-w-[86%] self-start rounded-[16px_16px_16px_4px] border bg-white px-3.5 py-2.5 text-[13.5px] leading-normal">
          On it. I&apos;ll check <span className="font-mono text-[12px]">api.dataprovider.eth</span> every hour and buy
          when the price crosses.
        </div>
        <div className="border-line max-w-[86%] self-start rounded-[16px_16px_16px_4px] border bg-white px-3.5 py-3 text-[13.5px] leading-normal">
          To pay for it, I need a spending permission:
          <div className="border-line bg-raise mb-0.5 mt-2.5 flex flex-col gap-[5px] rounded-[10px] border px-3 py-2.5">
            {(
              [
                ['Scope', 'USDC transfers only'],
                ['Cap', '5.00 USDC / day'],
                ['Expires', 'in 7 days'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[11.5px]">
                <span className="text-ink-3">{k}</span>
                <span className="font-mono text-[10.5px] font-semibold">{v}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onCta}
            className={`bg-ink mt-[11px] flex w-full cursor-pointer items-center justify-center gap-[7px] rounded-[10px] px-4 py-[11px] text-[13.5px] font-semibold text-white ${ctaInteract}`}
          >
            Delegate to agent <JdIcon.Arrow size={13} />
          </button>
        </div>
      </div>
      <div className="border-line border-t bg-white px-[18px] py-3">
        <div className="bg-raise-2 text-ink-4 flex items-center gap-2.5 rounded-full px-3.5 py-[9px] text-[13px]">
          Message Agens…
          <svg
            className="ml-auto"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </div>
        <div className="h-[34px]" />
      </div>
    </Screen>
  );
}
