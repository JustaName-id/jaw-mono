import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveKeysUrl } from './keys-url';

const ORIGINAL_ENV = { ...process.env };

/** Simulate the browser host, or pass `undefined` to simulate SSR (no window). */
function setHost(host: string | undefined) {
  if (host === undefined) {
    vi.stubGlobal('window', undefined);
    return;
  }
  vi.stubGlobal('window', { location: { host } });
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_KEYS_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe('resolveKeysUrl', () => {
  it('prefers the explicit NEXT_PUBLIC_KEYS_URL override (local dev)', () => {
    process.env.NEXT_PUBLIC_KEYS_URL = 'http://localhost:3000';
    setHost('playground-git-feature-just-a-lab.vercel.app');
    expect(resolveKeysUrl()).toBe('http://localhost:3000');
  });

  it("derives this PR's keys preview from the playground branch-alias host", () => {
    setHost('playground-git-feature-just-a-lab.vercel.app');
    expect(resolveKeysUrl()).toBe('https://keys-jaw-git-feature-just-a-lab.vercel.app');
  });

  it('is case-insensitive on the host', () => {
    setHost('Playground-Git-Feature-Just-A-Lab.Vercel.App');
    expect(resolveKeysUrl()).toBe('https://keys-jaw-git-feature-just-a-lab.vercel.app');
  });

  it('falls back to production keys when the derived host would be hashed (long branch)', () => {
    const longBranch = 'a'.repeat(60); // pushes the keys label past 63 chars
    setHost(`playground-git-${longBranch}-just-a-lab.vercel.app`);
    expect(resolveKeysUrl()).toBeUndefined();
  });

  it('falls back to production keys on the per-deployment hash host (no -git- alias)', () => {
    setHost('playground-abc123xyz-just-a-lab.vercel.app');
    expect(resolveKeysUrl()).toBeUndefined();
  });

  it('falls back to production keys on non-preview hosts', () => {
    setHost('playground-preview.jaw.id');
    expect(resolveKeysUrl()).toBeUndefined();
  });

  it('returns undefined in production so the SDK uses keys.jaw.id', () => {
    setHost('playground.jaw.id');
    expect(resolveKeysUrl()).toBeUndefined();
  });

  it('returns undefined during SSR with no override', () => {
    setHost(undefined);
    expect(resolveKeysUrl()).toBeUndefined();
  });

  it('still honors the explicit override during SSR', () => {
    process.env.NEXT_PUBLIC_KEYS_URL = 'https://keys.example.com';
    setHost(undefined);
    expect(resolveKeysUrl()).toBe('https://keys.example.com');
  });
});
