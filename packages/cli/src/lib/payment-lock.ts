import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';

/**
 * Serialize payments across processes.
 *
 * A spend cap is enforced by reading the ledger, checking the total, paying, and
 * appending the result. Seconds of network I/O sit between the read and the
 * write, so two payers that overlap in that window both see the same total, both
 * pass the cap, and both pay. The MCP server serializes its own tool calls in
 * memory, which does nothing about a second process: `jaw x402 pay --pay` next to
 * a running agent, or two agents at once.
 *
 * With a pre-funded payer the local cap is the only cap, so that window is the
 * difference between spending what was configured and spending the balance.
 *
 * The lock is a file created with `wx`, which is atomic: whoever creates it wins.
 * Everything else here is about not leaving it behind.
 */

interface LockFile {
  pid: number;
  /** Distinguishes our lock from one that replaced it after we judged it stale. */
  token: string;
  /** Epoch ms, for the age check. */
  at: number;
}

/**
 * A payment can legitimately take a while: up to 90s waiting on a top-up to
 * confirm, plus two 30s HTTP timeouts. The threshold sits well past that, so a
 * slow payment is never mistaken for a crashed one.
 */
export const STALE_AFTER_MS = 300_000;

/** How long to wait for the holder before refusing. Refusing is safe; overspending is not. */
export const DEFAULT_ACQUIRE_TIMEOUT_MS = 120_000;

const POLL_INTERVAL_MS = 100;

export interface LockOptions {
  timeoutMs?: number;
  staleAfterMs?: number;
  /** Called once when the wait becomes noticeable, so a blocked CLI explains itself. */
  onWait?: (holderPid: number) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readLock(): LockFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(PATHS.paymentLock, 'utf-8')) as LockFile;
    if (typeof parsed?.pid !== 'number' || typeof parsed?.at !== 'number') return null;
    return parsed;
  } catch {
    return null; // missing, truncated, or half-written: treat as breakable
  }
}

/** Signal 0 tests for existence without delivering anything. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists under another user, which still counts as alive.
    return (err as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

function isStale(lock: LockFile | null, staleAfterMs: number): boolean {
  if (!lock) return true; // unreadable: a leftover from a crash mid-write
  if (!isAlive(lock.pid)) return true; // holder died without releasing
  return Date.now() - lock.at > staleAfterMs; // alive but wedged past any real payment
}

/**
 * Remove a lock only if it still looks like the one judged stale.
 *
 * Between deciding and deleting, the holder may have released and someone else
 * acquired. Comparing first keeps this from deleting a live lock and letting two
 * payers through, which is the exact failure the lock exists to prevent.
 */
function breakLock(observed: LockFile | null): void {
  const current = readLock();
  const sameLock =
    (observed === null && current === null) ||
    (observed !== null && current !== null && current.token === observed.token && current.at === observed.at);
  if (!sameLock && current !== null) return;
  try {
    fs.unlinkSync(PATHS.paymentLock);
  } catch {
    /* already gone: someone else broke it first, which is the same outcome */
  }
}

/**
 * Hold the payment lock for the duration of `fn`.
 *
 * Held across the network call on purpose. The cap is only safe if the read, the
 * payment and the write happen as one unit, so payments are serialized machine
 * wide. They are inherently sequential for that reason, which the in-memory
 * queue in the MCP handler already assumed.
 */
export async function withPaymentLock<T>(fn: () => Promise<T>, options: LockOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS;
  const token = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + timeoutMs;

  ensureDir(PATHS.root);

  let notified = false;
  for (;;) {
    try {
      const fd = fs.openSync(PATHS.paymentLock, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, at: Date.now() } satisfies LockFile));
      } finally {
        fs.closeSync(fd);
      }
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') throw err;

      const holder = readLock();
      if (isStale(holder, staleAfterMs)) {
        breakLock(holder);
        continue; // retry immediately; the winner of the next `wx` takes it
      }
      if (!notified && holder) {
        notified = true;
        options.onWait?.(holder.pid);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Another payment has been running for ${Math.round((Date.now() - (holder?.at ?? Date.now())) / 1000)}s ` +
            `(pid ${holder?.pid ?? 'unknown'}). Refusing rather than paying past the session cap. ` +
            `Retry once it finishes, or remove ${PATHS.paymentLock} if that process is gone.`
        );
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // Registered for the duration: a kill between here and the finally would
  // otherwise leave a lock that every later payment has to wait out.
  const releaseOnExit = () => release(token);
  process.once('exit', releaseOnExit);

  try {
    return await fn();
  } finally {
    process.removeListener('exit', releaseOnExit);
    release(token);
  }
}

/** Release only our own lock: if ours was broken as stale, the file is someone else's now. */
function release(token: string): void {
  const current = readLock();
  if (current?.token !== token) return;
  try {
    fs.unlinkSync(PATHS.paymentLock);
  } catch {
    /* already gone */
  }
}
