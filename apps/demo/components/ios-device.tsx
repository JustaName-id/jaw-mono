'use client';

import type { ReactNode, Ref } from 'react';

// Simplified iOS device frame (ported from the design's ios-frame.jsx).
// The frame is the dialog's world: overlays inside it use absolute
// positioning against the screen, never the viewport.

// Bezel thickness around the screen; the rendered frame is
// (width + 2*IOS_BEZEL) x (height + 2*IOS_BEZEL).
export const IOS_BEZEL = 5;

export function IOSStatusBar({ dark = false, time = '9:41' }: { dark?: boolean; time?: string }) {
  const c = dark ? '#fff' : '#000';
  return (
    <div className="relative z-20 flex w-full items-center justify-center gap-[154px] px-6 pb-[19px] pt-[21px]">
      <div className="flex h-[22px] flex-1 items-center justify-center pt-[1.5px]">
        <span
          className="text-[17px] leading-[22px]"
          style={{ fontFamily: '-apple-system, "SF Pro", system-ui', fontWeight: 590, color: c }}
        >
          {time}
        </span>
      </div>
      <div className="flex h-[22px] flex-1 items-center justify-center gap-[7px] pr-px pt-px">
        <svg width="19" height="12" viewBox="0 0 19 12">
          <rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={c} />
          <rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={c} />
          <rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={c} />
          <rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={c} />
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12">
          <path
            d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z"
            fill={c}
          />
          <path
            d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z"
            fill={c}
          />
          <circle cx="8.5" cy="10.5" r="1.5" fill={c} />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={c} strokeOpacity="0.35" fill="none" />
          <rect x="2" y="2" width="20" height="9" rx="2" fill={c} />
          <path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={c} fillOpacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

// Hardware side keys sticking out of the bezel.
function SideKey({ side, top, h }: { side: 'left' | 'right'; top: number; h: number }) {
  return (
    <span
      className={`absolute w-[3.5px] bg-[#26262a] ${side === 'left' ? '-left-[3px] rounded-l-[2px]' : '-right-[3px] rounded-r-[2px]'}`}
      style={{ top, height: h, boxShadow: 'inset 0 1px 1px rgba(255,255,255,.18), inset 0 -1px 1px rgba(0,0,0,.4)' }}
    />
  );
}

export function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  screenRef,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
  dark?: boolean;
  /** Exposes the screen element so the page can pin the keys dialog to its rect. */
  screenRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className="relative" style={{ width: width + IOS_BEZEL * 2, height: height + IOS_BEZEL * 2 }}>
      {/* hardware keys: mute + volume on the left, power on the right */}
      <SideKey side="left" top={118} h={26} />
      <SideKey side="left" top={162} h={48} />
      <SideKey side="left" top={220} h={48} />
      <SideKey side="right" top={176} h={72} />
      {/* titanium body */}
      <div className="absolute inset-0 rounded-[52px] bg-[#0d0d10] shadow-[0_40px_80px_rgba(0,0,0,.25),0_4px_14px_rgba(0,0,0,.18)]">
        {/* rim highlight */}
        <span className="pointer-events-none absolute inset-px rounded-[51px] border border-white/20" />
        <span className="pointer-events-none absolute inset-0 rounded-[52px] border border-black/60" />
      </div>
      {/* screen */}
      <div
        ref={screenRef}
        className="absolute overflow-hidden antialiased"
        style={{
          inset: IOS_BEZEL,
          borderRadius: 47,
          background: dark ? '#000' : '#F2F2F7',
          fontFamily: '-apple-system, system-ui, sans-serif',
        }}
      >
        {/* dynamic island */}
        <div className="absolute left-1/2 top-[11px] z-50 h-[37px] w-[126px] -translate-x-1/2 rounded-3xl bg-black" />
        {/* status bar */}
        <div className="absolute inset-x-0 top-0 z-10">
          <IOSStatusBar dark={dark} />
        </div>
        {/* content */}
        <div className="flex h-full flex-col">
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
        {/* home indicator */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex h-[34px] items-end justify-center pb-2">
          <div
            className="h-[5px] w-[139px] rounded-full"
            style={{ background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)' }}
          />
        </div>
      </div>
    </div>
  );
}
