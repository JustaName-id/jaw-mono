import { expect, test } from 'vitest';

import { jaw } from './Connector.js';

test('setup', () => {
  const connectorFn = jaw({
    apiKey: 'test-api-key',
  });
  expect(jaw.type).toEqual('jaw');
  expect(typeof connectorFn).toBe('function');
});

test('setup with parameters', () => {
  const connectorFn = jaw({
    apiKey: 'test-api-key',
    appName: 'Test App',
    appLogoUrl: 'https://example.com/logo.png',
  });
  expect(jaw.type).toEqual('jaw');
  expect(typeof connectorFn).toBe('function');
});
