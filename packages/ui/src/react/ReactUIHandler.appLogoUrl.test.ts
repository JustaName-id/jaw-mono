// The SIWE and wallet_sign(0x45) dialog paths must thread the configured
// appLogoUrl through, or the sign-in screen falls back to the globe icon.
// renderDialog returns the element tree without rendering, so we can assert the
// chosen wrapper and its appLogoUrl prop directly.
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { ReactUIHandler } from './ReactUIHandler';

const LOGO = 'https://app.example/logo.png';

const VALID_SIWE =
  'app.example wants you to sign in with your Ethereum account:\n' +
  '0x1111111111111111111111111111111111111111\n\n' +
  'Sign in.\n\n' +
  'URI: https://app.example\nVersion: 1\nChain ID: 1\nNonce: abcdef123456\n' +
  'Issued At: 2026-01-01T00:00:00.000Z';

function handlerWithLogo(logo?: string): ReactUIHandler {
  const h = new ReactUIHandler();
  // Set the private config directly to skip init()'s theme/DOM side effects.
  (h as unknown as { config: Record<string, unknown> }).config = {
    apiKey: 'k',
    defaultChainId: 1,
    paymasters: {},
    appName: 'Example',
    appLogoUrl: logo,
  };
  return h;
}

function render(h: ReactUIHandler, request: unknown): ReactElement {
  return (
    h as unknown as {
      renderDialog: (r: unknown, a: () => void, x: () => void) => ReactElement;
    }
  ).renderDialog(
    request,
    () => undefined,
    () => undefined
  );
}

const typeName = (el: ReactElement) => (el.type as { name?: string }).name;

describe('ReactUIHandler — appLogoUrl reaches the SIWE dialog', () => {
  it('personal_sign SIWE → SiweDialogWrapper receives the configured appLogoUrl', () => {
    const el = render(handlerWithLogo(LOGO), {
      type: 'personal_sign',
      data: { message: VALID_SIWE, address: '0x1111111111111111111111111111111111111111', chainId: 1 },
    });
    expect(typeName(el)).toBe('SiweDialogWrapper');
    expect((el.props as { appLogoUrl?: string }).appLogoUrl).toBe(LOGO);
  });

  it('wallet_sign (0x45) SIWE → SiweDialogWrapper receives the configured appLogoUrl (the regressed path)', () => {
    const el = render(handlerWithLogo(LOGO), {
      type: 'wallet_sign',
      data: {
        address: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        request: { type: '0x45', data: { message: VALID_SIWE } },
      },
    });
    expect(typeName(el)).toBe('SiweDialogWrapper');
    expect((el.props as { appLogoUrl?: string }).appLogoUrl).toBe(LOGO);
  });

  it('passes undefined through untouched when no logo is configured (no accidental default)', () => {
    const el = render(handlerWithLogo(undefined), {
      type: 'personal_sign',
      data: { message: VALID_SIWE, address: '0x1111111111111111111111111111111111111111', chainId: 1 },
    });
    expect((el.props as { appLogoUrl?: string }).appLogoUrl).toBeUndefined();
  });
});
