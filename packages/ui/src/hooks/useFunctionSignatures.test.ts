// @vitest-environment jsdom
// The map this hook returns is a `useMemo` dependency in all three of its callers, and the `calls`
// array it feeds is listed in PermissionDialog's reverse-resolution effect. A fresh object per
// render therefore refired the whole ENS batch on every parent re-render — gas estimate landing,
// fee tokens arriving, token info resolving — and each run flips `isResolvingAddresses` back to
// true, which re-disables the confirm button mid-flow.
import { describe, expect, it, vi } from 'vitest';
import { ANY_FN_SEL } from '@jaw.id/core';

// No network: an unresolved selector is irrelevant to identity stability.
vi.mock('../utils/functionSignature', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/functionSignature')>();
  return { ...actual, resolveFunctionSignature: vi.fn().mockResolvedValue(null) };
});

import { useFunctionSignatures } from './useFunctionSignatures';

/** Mount the hook and re-render it N times, collecting each returned map. */
async function capture(selectors: string[], renders: number): Promise<Record<string, string>[]> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { createElement, useState } = await import('react');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');

  const seen: Record<string, string>[] = [];
  let bump: (n: number) => void = () => undefined;

  const Probe = () => {
    const [, setTick] = useState(0);
    bump = (n) => setTick(n);
    // A new array every render, mirroring `callsData.map((c) => c.selector)` at the call sites.
    seen.push(useFunctionSignatures([...selectors]));
    return null;
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(createElement(Probe));
    });
    for (let i = 1; i <= renders; i++) {
      await act(async () => {
        bump(i);
      });
    }
    return seen;
  } finally {
    act(() => root.unmount());
    document.body.innerHTML = '';
  }
}

describe('useFunctionSignatures — referential stability', () => {
  it('returns the same map across re-renders when nothing new resolved', async () => {
    const seen = await capture([ANY_FN_SEL], 3);
    expect(seen.length).toBeGreaterThan(3);
    // Identity, not contents: an equal-but-new object is what caused the churn.
    for (const map of seen.slice(1)) expect(map).toBe(seen[0]);
  });

  it('stays stable for an empty selector list', async () => {
    const seen = await capture([], 3);
    for (const map of seen.slice(1)) expect(map).toBe(seen[0]);
  });

  it('still resolves sentinel content', async () => {
    const [first] = await capture([ANY_FN_SEL], 0);
    expect(first[ANY_FN_SEL.toLowerCase()]).toBe('Any Function');
  });
});
