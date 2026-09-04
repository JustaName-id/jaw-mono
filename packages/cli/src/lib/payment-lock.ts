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
 * How long a lock may go without a heartbeat before it counts as abandoned.
 *
 * The holder rewrites `at` every `HEARTBEAT_INTERVAL_MS` while its work runs, so
 * this asks whether the holder is still making progress. It used to ask a
 * different question: how long a payment could possibly take, answered by summing
 * the timeouts on the payment path. `upto` then added two 90s `awaitCall`s and
 * pushed the bounded worst case to 249s, near enough to the old 300s that a
 * second payer arriving mid-payment could break a live lock and land in the
 * critical section beside it, both having read the same ledger total. A number
 * derived from a sum has to be re-derived every time a step is added, and was not.
 *
 * Three missed beats, so a momentarily busy event loop does not cost the lock.
 */
export const STALE_AFTER_MS = 90_000;

/** How often the holder rewrites `at` while its work runs. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** How long to wait for the holder before refusing. Refusing is safe; overspending is not. */
export const DEFAULT_ACQUIRE_TIMEOUT_MS = 120_000;

const POLL_INTERVAL_MS = 100;

export interface LockOptions {
  timeoutMs?: number;
  staleAfterMs?: number;
  /** Overridable so a test does not have to wait out a real interval. */
  heartbeatMs?: number;
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

/**
 * How long an unreadable lock file has to stay unreadable before it counts as
 * torn rather than newborn.
 */
const TORN_GRACE_MS = 2_000;

/**
 * A file that does not parse is either torn by a crash mid-write, or newborn:
 * `withPaymentLock` creates it with `wx` and writes a tick later, so there is a
 * real window where the winner's own lock reads as `null`. Breaking it there
 * hands the same critical section to a second payer, which is the one thing
 * this module exists to prevent. A torn file stops advancing its mtime, a
 * newborn one is about to, so age separates them.
 */
function unreadableLockIsTorn(): boolean {
  try {
    return Date.now() - fs.statSync(PATHS.paymentLock).mtimeMs > TORN_GRACE_MS;
  } catch {
    return true; // already gone: nothing left to protect
  }
}

function isStale(lock: LockFile | null, staleAfterMs: number): boolean {
  if (!lock) return unreadableLockIsTorn(); // torn by a crash, or still being written
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
  // Same grace as `isStale`, for the door it does not cover: `current === null`
  // also happens when the holder released and a third payer is mid-`wx`, its
  // file created and not yet written. Unlinking there deletes a lock that payer
  // believes it holds, and both of us end up inside the critical section.
  if (current === null && !unreadableLockIsTorn()) return;
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
        // Break it, then fall through to the deadline check and the sleep below
        // rather than retrying straight away. If the unlink cannot succeed (an
        // immutable file, or a directory at that path) its error is swallowed
        // and `wx` keeps returning EEXIST, so looping without yielding spins at
        // 100% CPU forever and wedges the whole process, not just the payment.
        breakLock(holder);
      } else if (!notified && holder) {
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

  // `unref` so a beat still pending cannot hold a finished command's event loop open.
  const heartbeat = setInterval(() => {
    if (!beat(token)) clearInterval(heartbeat);
  }, options.heartbeatMs ?? HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    process.removeListener('exit', releaseOnExit);
    release(token);
  }
}

/**
 * Rewrite `at` so the age check measures progress rather than a predicted duration.
 *
 * Renamed over the lock rather than written in place, because rename is atomic and
 * no reader ever sees a half-written file. Writing in place would reopen the torn
 * window `unreadableLockIsTorn` covers, once per interval instead of once at
 * creation.
 *
 * False when the file is no longer ours, which means our lock was judged stale and
 * taken while the work was still running. Beating over the new holder would leave
 * two payers in the critical section, so the caller stops beating instead.
 */
function beat(token: string): boolean {
  if (readLock()?.token !== token) return false;
  // Named by pid, not by token: a crash between the write and the rename leaves
  // this behind, and nothing in the CLI ever reads that directory to clean it. A
  // token is fresh per acquisition, so that would litter one file per crash; a
  // pid is reused by the OS, so the set stays bounded and the next payment from
  // the same slot overwrites it.
  const staging = `${PATHS.paymentLock}.${process.pid}`;
  try {
    fs.writeFileSync(staging, JSON.stringify({ pid: process.pid, token, at: Date.now() } satisfies LockFile), {
      mode: 0o600,
    });
    fs.renameSync(staging, PATHS.paymentLock);
  } catch {
    // One missed beat is survivable, the threshold allows three. A staging file
    // left behind is not, so clear it and let the next beat try again.
    try {
      fs.unlinkSync(staging);
    } catch {
      /* nothing to clean up */
    }
  }
  return true;
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
