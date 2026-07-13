'use client';

import { useRef } from 'react';

export const OTP_LENGTH = 6;

/** Modern 6-box numeric OTP input with paste, backspace, and arrow handling. */
export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');
  const focusBox = (i: number) => refs.current[Math.min(Math.max(i, 0), OTP_LENGTH - 1)]?.focus();
  const setDigit = (i: number, d: string) => {
    if (i < 0) return;
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, OTP_LENGTH));
  };

  return (
    <div className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          value={d}
          onChange={(e) => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            if (!digit) return;
            setDigit(i, digit);
            focusBox(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (digits[i]) setDigit(i, '');
              else {
                setDigit(i - 1, '');
                focusBox(i - 1);
              }
            } else if (e.key === 'ArrowLeft') {
              focusBox(i - 1);
            } else if (e.key === 'ArrowRight') {
              focusBox(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
            if (!pasted) return;
            onChange(pasted);
            focusBox(pasted.length);
          }}
          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 text-foreground h-12 w-full min-w-0 rounded-md border bg-transparent text-center text-lg font-medium outline-none transition-[color,box-shadow] focus-visible:ring-[1px] disabled:cursor-not-allowed disabled:opacity-50"
        />
      ))}
    </div>
  );
}
