import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';
import type { PeriodUnit } from '../x402/period.js';

/**
 * How the session account address is derived, as it appears on disk.
 *
 * 'eip7702' is the only one written now: the session key EOA itself, upgraded
 * in place via a delegation attached to its first userOp, so the session
 * account and the x402 payer are one address.
 *
 * 'counterfactual' is what earlier versions wrote, and what a config from
 * before the field existed means: a CREATE2 prediction from the account
 * factory, a second address that holds nothing and so cannot be charged for
 * the gas of the ops it sends. Still in the union because those files exist and
 * `SessionBridge` has to recognise them; `SessionSetup` never writes it.
 */
export type SessionMode = 'counterfactual' | 'eip7702';

/**
 * The USDC spend limit captured from the on-chain permission at setup, so the
 * local x402 policy can be seeded from what the user actually granted instead of
 * being configured separately and drifting from it. `allowance` is one period's
 * worth in base units (decimal string); `network` is the session chain's CAIP-2
 * id. Absent when the granted permission carries no registry-USDC spend.
 */
export interface GrantedSpend {
  token: string;
  allowance: string;
  network: string;
  /**
   * The period the allowance resets over, and how many of those units make one
   * period. Without these the allowance is dimensionless, and a per-period
   * number reads as a per-session one: a 5-USDC/day grant over a 7-day expiry
   * would cap the whole session at 5 instead of allowing 5 each day.
   *
   * Optional because configs written before this existed have no period
   * recorded. Consumers fall back to treating the allowance as session-wide,
   * which is what those configs already meant.
   */
  unit?: PeriodUnit;
  multiplier?: number;
  /**
   * ISO timestamp the periods are anchored at. The contract anchors at the
   * permission's `start`, which the grant response does not return, so this is
   * the local time the session was created. Anchoring early only makes a window
   * close sooner than the chain's, which refuses ahead of the chain rather than
   * behind it.
   */
  periodAnchor?: string;
}

/**
 * The granted permission as `JustaPermissionManager` stores it.
 *
 * Every view on the manager takes `Permission calldata` and hashes it inside:
 * `isApproved`, `isRevoked` and `getCurrentPeriod` all do, and none of them
 * accept an id. A session holding only `permissionId` therefore holds the one
 * field the chain will not answer about, which is why nothing local could tell
 * that a permission had been revoked from another device.
 *
 * The grant response already carries all of it, so this costs a wider write
 * rather than a network call. Optional on read for two reasons: configs written
 * before this field exist, and a wallet running an older core answers with the
 * id alone. Consumers fall back to the local file, which is what those sessions
 * already meant.
 */
export interface GrantedPermission {
  account: string;
  spender: string;
  /**
   * Unix seconds the permission starts at. Also the anchor the contract steps
   * its period windows from, which is the number `GrantedSpend.periodAnchor`
   * was approximating with the local clock.
   */
  start: number;
  /** Unix seconds the permission ends at. */
  end: number;
  /** Hex, as the grant returned it. Widened to a bigint at encode time. */
  salt: string;
  calls: Array<{ target: string; selector: string }>;
  spends: Array<{ token: string; allowance: string; unit: string; multiplier: number }>;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const SELECTOR_RE = /^0x[0-9a-fA-F]{8}$/;
const HEX_RE = /^0x[0-9a-fA-F]+$/;
/** Decimal or hex, matching what the SDK hands to `BigInt()`. */
const ALLOWANCE_RE = /^(0x[0-9a-fA-F]+|[0-9]+)$/;
/** The units a grant may carry. `year` has no on-chain enum and is rewritten before encoding. */
const SPEND_UNITS = new Set(['minute', 'hour', 'day', 'week', 'month', 'year', 'forever']);

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * The permission struct out of a `wallet_grantPermissions` response, or
 * undefined when the response does not carry a usable one.
 *
 * Undefined rather than a throw, on every malformed field. By the time this
 * runs the grant is already on chain, and refusing to write the session over a
 * field that arrived in an unexpected shape would strand a live permission with
 * no local record of it. A session that skips this keeps behaving the way every
 * session behaved before the field existed.
 *
 * Strict about what it does accept: a struct that is wrong in any part hashes
 * to something other than the granted permission, so every on-chain read made
 * from it would quietly answer about a permission that does not exist.
 */
export function parseGrantedPermission(raw: unknown): GrantedPermission | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;

  const { account, spender, salt } = r;
  if (typeof account !== 'string' || !ADDRESS_RE.test(account)) return undefined;
  if (typeof spender !== 'string' || !ADDRESS_RE.test(spender)) return undefined;
  if (typeof salt !== 'string' || !HEX_RE.test(salt)) return undefined;
  if (!isPositiveInt(r.start) || !isPositiveInt(r.end)) return undefined;

  if (!Array.isArray(r.calls) || r.calls.length === 0) return undefined;
  const calls: GrantedPermission['calls'] = [];
  for (const entry of r.calls) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { target, selector } = entry as Record<string, unknown>;
    if (typeof target !== 'string' || !ADDRESS_RE.test(target)) return undefined;
    // The response builds the selector from the signature, so an entry without
    // one cannot be reconstructed: the signature it came from is not returned.
    if (typeof selector !== 'string' || !SELECTOR_RE.test(selector)) return undefined;
    calls.push({ target, selector });
  }

  if (!Array.isArray(r.spends)) return undefined;
  const spends: GrantedPermission['spends'] = [];
  for (const entry of r.spends) {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const { token, allowance, unit, multiplier } = entry as Record<string, unknown>;
    if (typeof token !== 'string' || !ADDRESS_RE.test(token)) return undefined;
    if (typeof allowance !== 'string' || !ALLOWANCE_RE.test(allowance)) return undefined;
    if (typeof unit !== 'string' || !SPEND_UNITS.has(unit)) return undefined;
    // `multiplier` is a uint16 on chain and defaults to 1 in the grant, but the
    // encoded struct has to carry the number the permission was hashed with,
    // so an absent one is a struct we cannot rebuild rather than a 1.
    if (!isPositiveInt(multiplier) || multiplier > 65535) return undefined;
    spends.push({ token, allowance, unit, multiplier });
  }

  return { account, spender, start: r.start, end: r.end, salt, calls, spends };
}

/**
 * Whether this session predates the CLI settling on one account derivation, so
 * its permission belongs to an address separate from the session key and no op
 * it sends can be charged for its own gas.
 *
 * Named rather than compared inline: three callers ask this, and each one
 * spelled as `mode !== 'eip7702'` reads like a check for a variant among
 * several, when the only question is whether the session is still usable.
 */
export function isLegacySession(config: Pick<SessionConfig, 'mode'>): boolean {
  return config.mode !== 'eip7702';
}

export interface SessionConfig {
  ownerAddress: string;
  sessionAddress: string;
  permissionId: string;
  chainId: number;
  expiry: number;
  createdAt: string;
  mode?: SessionMode;
  grantedSpend?: GrantedSpend;
  /** The struct the on-chain reads need. Absent on older sessions; see the type. */
  permission?: GrantedPermission;
}

/**
 * `mode` is required and pinned here, unlike on the read side where it stays
 * optional to describe files earlier versions wrote. Nothing but `SessionSetup`
 * writes a session, and a session written without the mode would be refused by
 * `SessionBridge` as if an old CLI had made it, so the compiler holds the
 * invariant rather than a test having to.
 */
export function saveSessionConfig(input: Omit<SessionConfig, 'createdAt' | 'mode'> & { mode: 'eip7702' }): void {
  const config: SessionConfig = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.sessionConfig, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.chmodSync(PATHS.sessionConfig, 0o600);
}

export function sessionConfigExists(): boolean {
  return fs.existsSync(PATHS.sessionConfig);
}

export function loadSessionConfig(): SessionConfig {
  if (!fs.existsSync(PATHS.sessionConfig)) {
    throw new Error('No session configured. Run `jaw session setup` first.');
  }
  const raw = fs.readFileSync(PATHS.sessionConfig, 'utf-8');
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    throw new Error(`Session config at ${PATHS.sessionConfig} is corrupted. Run \`jaw session setup\` to recreate it.`);
  }
}

/**
 * Like `loadSessionConfig`, but returns null instead of throwing when the file
 * is missing or unreadable. For callers that can recover from a keystore whose
 * session-config is gone (interrupted setup, manual deletion, partial restore)
 * rather than callers that need an existing session to do their job.
 */
export function tryLoadSessionConfig(): SessionConfig | null {
  try {
    return loadSessionConfig();
  } catch {
    return null;
  }
}

export function deleteSessionConfig(): void {
  if (fs.existsSync(PATHS.sessionConfig)) {
    fs.unlinkSync(PATHS.sessionConfig);
  }
}
