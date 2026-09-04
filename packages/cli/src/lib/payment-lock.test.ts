import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-payment-lock-test');

vi.mock('./paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-payment-lock-test');
  return { PATHS: { root, config: p.join(root, 'config.json'), paymentLock: p.join(root, 'x402-payment.lock') } };
});

const { withPaymentLock } = await import('./payment-lock.js');
const { PATHS } = await import('./paths.js');

const writeLock = (o: Record<string, unknown>) =>
  fs.writeFileSync(PATHS.paymentLock, JSON.stringify({ pid: process.pid, token: 'other', at: Date.now(), ...o }));

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});
afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

describe('withPaymentLock', () => {
  it('runs the work and releases afterwards', async () => {
    const result = await withPaymentLock(async () => 'done');
    expect(result).toBe('done');
    expect(fs.existsSync(PATHS.paymentLock)).toBe(false);
  });

  it('releases even when the work throws', async () => {
    await expect(
      withPaymentLock(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(fs.existsSync(PATHS.paymentLock)).toBe(false);
  });

  it('holds the lock for the duration', async () => {
    await withPaymentLock(async () => {
      expect(fs.existsSync(PATHS.paymentLock)).toBe(true);
      const held = JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8'));
      expect(held.pid).toBe(process.pid);
    });
  });

  // The whole point: a second payer must not run alongside the first.
  it('refuses rather than running while a live lock is held', async () => {
    writeLock({ pid: process.pid, at: Date.now() });
    const work = vi.fn();
    await expect(withPaymentLock(work, { timeoutMs: 200 })).rejects.toThrow(/Another payment/);
    expect(work).not.toHaveBeenCalled();
  });

  it('names the holder and points at the file when it gives up', async () => {
    writeLock({ pid: process.pid, at: Date.now() });
    await expect(withPaymentLock(async () => 'x', { timeoutMs: 100 })).rejects.toThrow(
      new RegExp(`pid ${process.pid}[\\s\\S]*x402-payment.lock`)
    );
  });

  it('reports the wait once before blocking', async () => {
    writeLock({ pid: process.pid, at: Date.now() });
    const onWait = vi.fn();
    await expect(withPaymentLock(async () => 'x', { timeoutMs: 250, onWait })).rejects.toThrow();
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledWith(process.pid);
  });

  // A crash leaves the file behind; every later payment would wait it out.
  it('breaks a lock whose holder is gone', async () => {
    writeLock({ pid: 999_999_999, at: Date.now() }); // pid that cannot be alive
    await expect(withPaymentLock(async () => 'ran', { timeoutMs: 500 })).resolves.toBe('ran');
  });

  it('breaks a lock held past the staleness threshold', async () => {
    writeLock({ pid: process.pid, at: Date.now() - 10_000 });
    await expect(withPaymentLock(async () => 'ran', { timeoutMs: 500, staleAfterMs: 1000 })).resolves.toBe('ran');
  });

  it('does not break a live lock that is merely slow', async () => {
    writeLock({ pid: process.pid, at: Date.now() - 500 });
    await expect(withPaymentLock(async () => 'ran', { timeoutMs: 150, staleAfterMs: 60_000 })).rejects.toThrow();
  });

  it('treats an unreadable lock as breakable, not as a permanent block', async () => {
    fs.writeFileSync(PATHS.paymentLock, '{ truncated mid-write');
    // Aged past the torn grace: an unreadable file that is not advancing its
    // mtime really is a leftover, unlike one being written right now.
    const old = Date.now() - 10_000;
    fs.utimesSync(PATHS.paymentLock, new Date(old), new Date(old));
    await expect(withPaymentLock(async () => 'ran', { timeoutMs: 500 })).resolves.toBe('ran');
  });

  // If ours was broken as stale and someone else took the file, releasing must
  // not delete theirs: that would let two payers through, the exact failure the
  // lock exists to prevent.
  it('never deletes a lock that is no longer ours', async () => {
    await withPaymentLock(async () => {
      fs.writeFileSync(PATHS.paymentLock, JSON.stringify({ pid: 1, token: 'someone-else', at: Date.now() }));
    });
    expect(fs.existsSync(PATHS.paymentLock)).toBe(true);
    expect(JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8')).token).toBe('someone-else');
  });

  // The point of holding it across the network call: whatever the caller does
  // inside, including writing its result, happens before anyone else reads.
  it('admits no one until the work has finished writing', async () => {
    const events: string[] = [];
    const slowPayer = withPaymentLock(async () => {
      events.push('A: pays');
      await new Promise((r) => setTimeout(r, 120));
      events.push('A: records'); // stands in for appendX402Log
    });
    // Starts while A is mid-payment and has to wait out the recording too.
    await new Promise((r) => setTimeout(r, 20));
    const nextPayer = withPaymentLock(async () => events.push('B: reads'), { timeoutMs: 2000 });

    await Promise.all([slowPayer, nextPayer]);
    expect(events).toEqual(['A: pays', 'A: records', 'B: reads']);
  });

  it('creates the lock file with owner-only permissions', async () => {
    await withPaymentLock(async () => {
      expect(fs.statSync(PATHS.paymentLock).mode & 0o777).toBe(0o600);
    });
  });
});

describe('withPaymentLock heartbeat', () => {
  // The reason the heartbeat exists. `at` used to be written once, so the
  // threshold had to predict how long a payment could take: it was a sum of the
  // timeouts on the payment path, `upto` added two 90s waits to that path, and a
  // second payer arriving mid-payment could break a live lock and end up in the
  // critical section beside the first, both having read the same ledger total.
  it('does not let a beating holder be broken as stale', async () => {
    const holder = withPaymentLock(async () => new Promise((r) => setTimeout(r, 400)), { heartbeatMs: 25 });
    await new Promise((r) => setTimeout(r, 40));

    // Would have broken the lock at 200ms without a beat, since `at` never moved.
    await expect(withPaymentLock(async () => 'got in', { staleAfterMs: 200, timeoutMs: 300 })).rejects.toThrow(
      /Another payment/
    );
    await holder;
  });

  it('advances `at` while the work runs', async () => {
    let first = 0;
    let last = 0;
    await withPaymentLock(
      async () => {
        first = JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8')).at;
        await new Promise((r) => setTimeout(r, 120));
        last = JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8')).at;
      },
      { heartbeatMs: 20 }
    );
    expect(last).toBeGreaterThan(first);
  });

  // The beat-side twin of "never deletes a lock that is no longer ours". If ours
  // was broken as stale and someone else took the file, writing our timestamp
  // over theirs would hide a live second payer behind our own liveness.
  it('stops beating once the lock is no longer ours', async () => {
    const foreign = { pid: process.pid, token: 'someone-else', at: Date.now() - 10_000 };
    await withPaymentLock(
      async () => {
        fs.writeFileSync(PATHS.paymentLock, JSON.stringify(foreign));
        await new Promise((r) => setTimeout(r, 120));
      },
      { heartbeatMs: 20 }
    );
    expect(JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8'))).toEqual(foreign);
  });

  // Beats are renamed over the lock rather than written in place. A plain write
  // truncates first, so every interval would reopen the window where the file
  // parses as null and `unreadableLockIsTorn` has to adjudicate it.
  it('is never observed half-written by a concurrent reader', async () => {
    await withPaymentLock(
      async () => {
        const until = Date.now() + 200;
        while (Date.now() < until) {
          const raw = fs.readFileSync(PATHS.paymentLock, 'utf-8');
          expect(JSON.parse(raw).pid).toBe(process.pid);
          await new Promise((r) => setTimeout(r, 1));
        }
      },
      { heartbeatMs: 5 }
    );
  });

  it('leaves no staging file behind', async () => {
    await withPaymentLock(async () => new Promise((r) => setTimeout(r, 80)), { heartbeatMs: 10 });
    expect(fs.readdirSync(TEST_ROOT)).toEqual([]);
  });
});

describe('withPaymentLock, unreadable and unbreakable locks', () => {
  it('waits out a lock file that is still being written instead of breaking it', async () => {
    // The winner creates the file with `wx` and writes a tick later, so there is
    // a window where its own lock reads as null. Treating that as stale hands
    // the critical section to a second payer, which is what the lock prevents.
    fs.writeFileSync(PATHS.paymentLock, '');

    await expect(withPaymentLock(async () => 'second payer got in', { timeoutMs: 300 })).rejects.toThrow(
      /Another payment has been running/
    );
    expect(fs.existsSync(PATHS.paymentLock)).toBe(true);
  });

  it('still breaks a lock file that has been unreadable long enough to be torn', async () => {
    fs.writeFileSync(PATHS.paymentLock, 'half a json');
    const old = Date.now() - 10_000;
    fs.utimesSync(PATHS.paymentLock, new Date(old), new Date(old));

    await expect(withPaymentLock(async () => 'recovered', { timeoutMs: 2_000 })).resolves.toBe('recovered');
  });

  it('gives up on the deadline when the stale lock cannot be removed', async () => {
    // A directory at the lock path: `wx` keeps returning EEXIST and unlink can
    // never clear it. Retrying without checking the deadline or yielding spins
    // at full CPU forever, which wedges the whole process in `jaw mcp`.
    fs.mkdirSync(PATHS.paymentLock);
    // Aged so it reads as torn, which is what sends the loop down the break
    // path in the first place. Without this the run never gets there.
    const aged = Date.now() - 10_000;
    fs.utimesSync(PATHS.paymentLock, new Date(aged), new Date(aged));
    const timer = vi.fn();
    const handle = setTimeout(timer, 50);

    const started = Date.now();
    await expect(withPaymentLock(async () => 'never', { timeoutMs: 300 })).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(3_000);
    expect(timer).toHaveBeenCalled(); // the event loop kept turning
    clearTimeout(handle);
    fs.rmdirSync(PATHS.paymentLock);
  });
});

describe('withPaymentLock heartbeat staging file', () => {
  // A crash between the staging write and the rename leaves the file behind, and
  // nothing in the CLI sweeps `~/.jaw`. Naming it by pid means the next payment
  // from the same process slot consumes the leftover instead of adding to it; a
  // token, fresh per acquisition, would leave one file per crash forever.
  it('consumes a staging file left behind by an earlier crash', async () => {
    const staging = `${PATHS.paymentLock}.${process.pid}`;
    fs.writeFileSync(staging, 'left over from a crash');

    await withPaymentLock(async () => new Promise((r) => setTimeout(r, 40)), { heartbeatMs: 10 });

    expect(fs.existsSync(staging)).toBe(false);
    expect(fs.readdirSync(TEST_ROOT)).toEqual([]);
  });
});
