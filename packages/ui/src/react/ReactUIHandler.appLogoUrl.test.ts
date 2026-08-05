// @vitest-environment jsdom
// The SIWE and wallet_sign(0x45) dialog paths must thread the configured
// appLogoUrl through, or the sign-in screen falls back to the globe icon.
// renderDialog returns the element tree without rendering, so we can assert the
// chosen wrapper and its appLogoUrl prop directly. (jsdom is for the boundary
// test at the bottom, which mounts for real.)
import { describe, expect, it, vi } from 'vitest';
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

// The boundary is what stops a render throw from stranding the caller: React unmounts
// the tree on an uncaught error but can't settle a promise it knows nothing about, so
// without this a crashed dialog means the dApp waits forever.
describe('DialogErrorBoundary', () => {
  it('calls onError with the thrown error and renders nothing', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { createElement } = await import('react');
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { DialogErrorBoundary } = await import('./ReactUIHandler');

    const Boom = () => {
      throw new Error('render exploded');
    };
    const seen: Error[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // React logs the caught error; silence it so the run stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => {
      root.render(createElement(DialogErrorBoundary, { onError: (e: Error) => seen.push(e) }, createElement(Boom)));
    });
    spy.mockRestore();

    expect(seen).toHaveLength(1);
    expect(seen[0].message).toBe('render exploded');
    expect(container.innerHTML).toBe('');

    act(() => root.unmount());
    document.body.innerHTML = '';
  });
});
