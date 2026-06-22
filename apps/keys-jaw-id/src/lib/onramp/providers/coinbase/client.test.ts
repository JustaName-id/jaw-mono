import { describe, it, expect } from 'vitest';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { parseCdpSecret, buildBearerToken } from './client';

describe('CDP JWT auth', () => {
  it('parses an Ed25519 base64 seed and signs an EdDSA JWT bound to the request', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    // CDP Ed25519 secrets are base64 of the 32-byte seed (or seed+pubkey).
    const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
    const secret = Buffer.from(jwk.d, 'base64url').toString('base64');

    const { key, alg } = parseCdpSecret(secret);
    expect(alg).toBe('EdDSA');

    const token = await buildBearerToken({
      keyId: 'kid-1',
      key,
      alg,
      method: 'POST',
      path: '/v2/onramp/orders',
    });

    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('EdDSA');
    expect(header.kid).toBe('kid-1');
    expect(header.nonce).toMatch(/^[0-9a-f]{16}$/);

    const { payload } = await jwtVerify(token, createPublicKey(privateKey), {
      issuer: 'cdp',
      audience: 'cdp_service',
    });
    expect(payload.sub).toBe('kid-1');
    expect(payload.uri).toBe('POST api.cdp.coinbase.com/platform/v2/onramp/orders');
  });

  it('parses an EC PEM and signs an ES256 JWT bound to the request', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'sec1', format: 'pem' }) as string;
    expect(pem).toContain('BEGIN EC PRIVATE KEY');

    const { key, alg } = parseCdpSecret(pem);
    expect(alg).toBe('ES256');

    const token = await buildBearerToken({
      keyId: 'kid-2',
      key,
      alg,
      method: 'GET',
      path: '/v2/onramp/orders/abc',
    });

    const { payload } = await jwtVerify(token, createPublicKey(privateKey), {
      issuer: 'cdp',
      audience: 'cdp_service',
    });
    expect(payload.uri).toBe('GET api.cdp.coinbase.com/platform/v2/onramp/orders/abc');
  });

  it('rejects a secret that is neither a PEM nor a 32/64-byte key', () => {
    expect(() => parseCdpSecret(Buffer.from('too-short').toString('base64'))).toThrow(/expected 32 or 64/);
  });
});
