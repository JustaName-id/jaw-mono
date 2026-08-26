'use client';

import { CtaBtn, Screen } from './common';
import { Icon } from '@/components/ui';

const blue = 'rgb(8,81,255)';

// "Nova": social app onboarding.
export function SocialApp({ onCta }: { onCta: () => void }) {
  return (
    <Screen>
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: 'linear-gradient(180deg,#EEF3FF 0%,#F8FAFF 62%,#fff 100%)' }}
      >
        <div
          className="absolute -right-[60px] -top-[70px] h-[230px] w-[230px] rounded-full"
          style={{ background: 'radial-gradient(circle at 30% 30%, rgba(8,81,255,.22), rgba(8,81,255,0) 70%)' }}
        />
        <div className="absolute inset-x-0 top-16 flex justify-center">
          <div
            className="grid h-[26px] w-[26px] place-items-center rounded-[9px] text-[13px] font-bold text-white"
            style={{ background: blue }}
          >
            N
          </div>
        </div>
        <div className="absolute inset-x-[26px] top-[112px]">
          <div
            className="-rotate-[2.2deg] rounded-[18px] bg-white p-[13px_14px]"
            style={{ boxShadow: '0 18px 40px -22px rgba(15,23,42,.4)' }}
          >
            <div className="mb-2.5 flex items-center gap-[9px]">
              <span
                className="h-[30px] w-[30px] shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg,#38BDF8,#0EA5E9)' }}
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-[650] tracking-[-0.01em]">Leo</span>
                <span className="text-ink-3 block font-mono text-[9.5px]">leo.nova.eth</span>
              </span>
              <span
                className="ml-auto rounded-full border border-[rgba(8,81,255,.25)] px-[9px] py-[3px] text-[10px] font-semibold"
                style={{ color: blue }}
              >
                Follow
              </span>
            </div>
            <div className="h-[70px] rounded-xl" style={{ background: 'linear-gradient(135deg,#C7D9FF,#8FB0F7)' }} />
          </div>
          <div
            className="mt-3 rotate-[1.8deg] rounded-[18px] bg-white p-[13px_14px]"
            style={{ boxShadow: '0 18px 40px -22px rgba(15,23,42,.35)' }}
          >
            <div className="flex items-center gap-[9px]">
              <span
                className="h-[30px] w-[30px] shrink-0 rounded-full"
                style={{ background: 'linear-gradient(135deg,#FDA4AF,#F43F5E)' }}
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-[650] tracking-[-0.01em]">Mia</span>
                <span className="text-ink-3 block font-mono text-[9.5px]">mia.nova.eth</span>
              </span>
              <span className="text-green ml-auto inline-flex items-center gap-1 text-[9.5px] font-semibold">
                <Icon.Check size={9} />
                Yours
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5">
              <span className="bg-raise-2 h-[7px] rounded-full" />
              <span className="bg-raise-2 h-[7px] w-[62%] rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="px-[26px] pb-[46px] text-center">
        <div className="mb-2 text-[25px] font-[650] leading-[1.15] tracking-[-0.03em]">
          Your name, your people,
          <br />
          your posts
        </div>
        <p className="text-ink-2 mx-auto mb-4 max-w-[280px] text-[14px] leading-normal">
          One tap and you&apos;re in. Nova gives you an account and a name you keep, even if you leave.
        </p>
        <div className="mb-[18px] flex justify-center gap-[5px]">
          <span className="h-[5px] w-4 rounded-full" style={{ background: blue }} />
          <span className="bg-line-2 h-[5px] w-[5px] rounded-full" />
          <span className="bg-line-2 h-[5px] w-[5px] rounded-full" />
        </div>
        <CtaBtn label="Continue" color={blue} onClick={onCta} />
        <div className="text-ink-3 mt-3 text-[12.5px]">Sign-In/Sign-Up</div>
      </div>
    </Screen>
  );
}
