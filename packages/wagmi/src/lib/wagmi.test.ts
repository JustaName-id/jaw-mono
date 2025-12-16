import { expect, test } from 'vitest';

import { jawWallet } from './wagmi.js';

test('setup', () => {
  const connectorFn = jawWallet({
    apiKey: 'test-api-key',
  });
  expect(jawWallet.type).toEqual('jawWallet');
  expect(typeof connectorFn).toBe('function');
});

test('setup with parameters', () => {
  const connectorFn = jawWallet({
    apiKey: 'test-api-key',
    appName: 'Test App',
    appLogoUrl: 'https://example.com/logo.png',
  });
  expect(jawWallet.type).toEqual('jawWallet');
  expect(typeof connectorFn).toBe('function');
});
