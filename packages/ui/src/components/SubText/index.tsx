import type { ReactNode } from 'react';

const SUB_TO_NORMAL: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
};
const SUB_RUN = /[₀-₉]+/g;

/**
 * Render a string, turning any run of Unicode subscript digits (as produced by
 * `subscriptDecimal`, e.g. "0.0₅2732") into a real lowered <sub>. Fonts don't reliably
 * lower the ₀–₉ glyphs themselves, so we drop them below the baseline via CSS instead —
 * consistent everywhere regardless of the mono font in use.
 */
export function SubText({ children, className }: { children: string; className?: string }) {
  if (!/[₀-₉]/.test(children)) {
    return className ? <span className={className}>{children}</span> : <>{children}</>;
  }
  const parts: ReactNode[] = [];
  let last = 0;
  SUB_RUN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SUB_RUN.exec(children))) {
    if (m.index > last) parts.push(children.slice(last, m.index));
    const normal = m[0].replace(/./g, (c) => SUB_TO_NORMAL[c] ?? c);
    parts.push(
      <sub key={m.index} className="align-sub text-[0.72em]">
        {normal}
      </sub>
    );
    last = m.index + m[0].length;
  }
  if (last < children.length) parts.push(children.slice(last));
  return className ? <span className={className}>{parts}</span> : <>{parts}</>;
}
