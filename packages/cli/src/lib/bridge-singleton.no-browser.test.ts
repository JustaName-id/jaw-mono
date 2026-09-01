import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * `getBridge` launches the system browser for a new session. That is the right
 * default at a terminal and useless everywhere else: over SSH it opens a browser
 * on the wrong machine, in a container it opens nothing, and under a test driver
 * there is no way to reach the URL at all. In each case the command sits waiting
 * on an approval nobody was told how to give.
 */

const opened: string[] = [];
vi.mock('open', () => ({
  default: (url: string) => {
    opened.push(url);
    return Promise.resolve();
  },
}));

const onBrowserNeeded: Array<(() => Promise<void>) | undefined> = [];
const constructed: Array<{ timeout?: number; connectTimeout?: number }> = [];
vi.mock('./ws-bridge.js', () => ({
  WSBridge: vi.fn().mockImplementation((options: { timeout?: number; connectTimeout?: number }) => {
    constructed.push(options);
    return {
      connect: vi.fn(async (needed?: () => Promise<void>) => {
        onBrowserNeeded.push(needed);
        await needed?.();
      }),
    };
  }),
}));

vi.mock('./config.js', () => ({ loadConfig: vi.fn().mockReturnValue({}) }));

// No stored session, so this is the path that opens a browser.
vi.mock('./relay-session.js', () => ({
  loadRelaySession: vi.fn(() => null),
  saveRelaySession: vi.fn(),
  deleteRelaySession: vi.fn(),
}));

const { getBridge } = await import('./bridge-singleton.js');

let written: string[] = [];

beforeEach(() => {
  opened.length = 0;
  onBrowserNeeded.length = 0;
  constructed.length = 0;
  delete process.env.JAW_BRIDGE_TIMEOUT_MS;
  written = [];
  delete process.env.JAW_NO_BROWSER;
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
});

const connect = () => getBridge({ apiKey: 'k', chainId: 84532, keysUrl: 'https://keys.jaw.id' });

describe('getBridge, without a browser to open', () => {
  it('opens the browser by default, which is what a terminal wants', async () => {
    await connect();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain('/cli-bridge');
    expect(written.join('')).toBe('');
  });

  it('prints the URL instead when there is no browser worth opening', async () => {
    process.env.JAW_NO_BROWSER = '1';
    await connect();

    expect(opened).toEqual([]);
    expect(written.join('')).toContain('/cli-bridge');
  });

  /**
   * On stderr, because the URL would otherwise land in the middle of a
   * `--output json` document and make it unparseable for the caller that most
   * needs this: something driving the CLI without a person at it.
   */
  it('prints it on stderr, where json output cannot be corrupted by it', async () => {
    process.env.JAW_NO_BROWSER = '1';
    await connect();
    expect(written.join('')).toMatch(/^Open this URL to approve:\nhttps:\/\/keys\.jaw\.id\/cli-bridge\?/);
  });

  // The relay session and the CLI's public key travel in it, so a URL missing
  // either reaches a page that cannot pair with this process.
  it('prints a URL carrying the session and the public key', async () => {
    process.env.JAW_NO_BROWSER = '1';
    await connect();

    const url = new URL(written.join('').split('\n')[1]);
    expect(url.searchParams.get('session')).toBeTruthy();
    expect(url.searchParams.get('relay')).toBe('wss://relay.jaw.id');
    expect(url.hash).toMatch(/^#pk=/);
  });

  /**
   * The wait is on a person: opening a link, maybe on another device, maybe
   * enrolling a passkey for the first time. Two minutes suits someone already
   * signed in at a terminal and nobody else, and the default is not reachable
   * from any command.
   */
  it('takes the approval wait from the environment', async () => {
    process.env.JAW_BRIDGE_TIMEOUT_MS = '600000';
    await connect();
    expect(constructed[0]?.timeout).toBe(600000);
  });

  /**
   * Two waits, and the first attempt at this raised only the second. The one
   * that runs out while a person is opening a URL is the browser reaching the
   * relay, hardcoded at thirty seconds and untouched by the knob that was
   * supposed to cover it, so the E2E timed out again with the setting applied.
   */
  it('raises the wait for the browser to connect, not just the one to approve', async () => {
    process.env.JAW_BRIDGE_TIMEOUT_MS = '600000';
    await connect();
    expect(constructed[0]?.connectTimeout).toBe(600000);
  });

  it('leaves both defaults alone for a value that is not a positive number', async () => {
    process.env.JAW_BRIDGE_TIMEOUT_MS = 'soon';
    await connect();
    expect(constructed[0]?.timeout).toBeUndefined();
    expect(constructed[0]?.connectTimeout).toBeUndefined();
  });
});
