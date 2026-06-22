// Server-only: imports node:crypto, so it can never be bundled into a client
// component. Builds the CDP bearer JWT and calls the CDP REST API.
import { createPrivateKey, randomBytes, type KeyObject } from 'node:crypto';
import { SignJWT } from 'jose';
import {
  CDP_HOST,
  CDP_BASE_URL,
  CDP_API_PREFIX,
  CDP_JWT_ISSUER,
  CDP_JWT_AUDIENCE,
  CDP_JWT_TTL_SECONDS,
} from './config';

export class CoinbaseApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message?: string
  ) {
    super(message ?? `Coinbase CDP API error ${status}`);
    this.name = 'CoinbaseApiError';
  }
}

// DER prefix for an Ed25519 PKCS8 private key wrapping a raw 32-byte seed.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export type CdpSigningKey = { key: KeyObject; alg: 'EdDSA' | 'ES256' };

// CDP secrets come in two shapes:
//   - Ed25519: base64 of 64 bytes (32-byte seed + 32-byte public key), or just
//     the 32-byte seed. We wrap the seed in a PKCS8 envelope and sign EdDSA.
//   - EC (legacy): a PEM "-----BEGIN EC PRIVATE KEY-----", signed ES256.
// Pure (no env / network) so it can be unit-tested.
export function parseCdpSecret(secret: string): CdpSigningKey {
  const trimmed = secret.trim();

  if (trimmed.includes('BEGIN')) {
    return { key: createPrivateKey(trimmed.replace(/\\n/g, '\n')), alg: 'ES256' };
  }

  const raw = Buffer.from(trimmed, 'base64');
  if (raw.length !== 64 && raw.length !== 32) {
    throw new Error(
      `CDP_API_KEY_SECRET is not a PEM and decoded to ${raw.length} bytes (expected 32 or 64 for an Ed25519 key)`
    );
  }
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, raw.subarray(0, 32)]);
  return { key: createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }), alg: 'EdDSA' };
}

// Build a per-request bearer JWT. The `uri` claim binds the token to a single
// method + host + path; CDP rejects it for any other request. We include both
// `uri` and `uris` so the token is accepted regardless of which claim name the
// endpoint validates (unknown claims are ignored). Pure (no env) for testing.
export function buildBearerToken(args: {
  keyId: string;
  key: KeyObject;
  alg: 'EdDSA' | 'ES256';
  method: string;
  path: string;
}): Promise<string> {
  const uri = `${args.method} ${CDP_HOST}${CDP_API_PREFIX}${args.path}`;
  const nonce = randomBytes(8).toString('hex'); // 16 hex chars

  return new SignJWT({ uri, uris: [uri] })
    .setProtectedHeader({ alg: args.alg, kid: args.keyId, typ: 'JWT', nonce })
    .setIssuer(CDP_JWT_ISSUER)
    .setSubject(args.keyId)
    .setAudience(CDP_JWT_AUDIENCE)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime(`${CDP_JWT_TTL_SECONDS}s`)
    .sign(args.key);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Coinbase not configured: missing ${name}`);
  return v;
}

let cachedKey: CdpSigningKey | null = null;
function getSigningKey(): CdpSigningKey {
  if (!cachedKey) cachedKey = parseCdpSecret(requireEnv('CDP_API_KEY_SECRET'));
  return cachedKey;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const keyId = requireEnv('CDP_API_KEY_ID');
  const { key, alg } = getSigningKey();
  const token = await buildBearerToken({ keyId, key, alg, method, path });

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const bodyText = body !== undefined ? JSON.stringify(body) : undefined;
  if (bodyText) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${CDP_BASE_URL}${CDP_API_PREFIX}${path}`, {
    method,
    headers,
    body: bodyText,
    cache: 'no-store',
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    console.error(`[coinbase] ${method} ${path} -> ${res.status}`, parsed);
    throw new CoinbaseApiError(res.status, parsed);
  }
  return parsed as T;
}

export const cdpGet = <T>(path: string) => request<T>('GET', path);
export const cdpPost = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
