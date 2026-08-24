'use client';

import { UsdcLogo } from '@/components/screens/swap';

// Full-screen (of the demo phone) hold while /api/fund tops the fresh account
// up with testnet USDC: frosted veil, a flipping USDC coin inside a spinner
// ring.
export function FundingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-jd-fade absolute inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-white/90 backdrop-blur-[6px]"
    >
      <div className="relative grid h-[84px] w-[84px] place-items-center" style={{ perspective: '260px' }}>
        <span className="border-line border-t-jaw-blue animate-jd-spin absolute inset-0 rounded-full border-2 [animation-duration:1.1s]" />
        <span className="animate-jd-coin grid place-items-center [transform-style:preserve-3d]">
          <UsdcLogo size={36} />
        </span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-ink text-[16.5px] font-semibold tracking-[-0.02em]">Funding your account</span>
        <span className="text-ink-3 font-mono text-[9.5px] uppercase tracking-[.14em]">
          Testnet USDC · Base Sepolia
        </span>
      </div>
    </div>
  );
}
