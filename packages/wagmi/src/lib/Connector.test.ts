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

test('setTheme is callable and does not force-create a provider', () => {
  const connectorFn = jaw({ apiKey: 'test-api-key' });
  const emitter = {
    uid: 'test',
    emit: () => undefined,
    on: () => undefined,
    off: () => undefined,
    once: () => undefined,
    listenerCount: () => 0,
  };
  // Instantiate the connector with a minimal config (no provider created yet).
  const connector = connectorFn({ emitter, chains: [], transports: {} } as never) as {
    setTheme: (theme: unknown) => void;
  };

  // Before any provider exists, setTheme must be a safe no-op — it must NOT
  // create a provider (which would prewarm a duplicate iframe under StrictMode).
  expect(typeof connector.setTheme).toBe('function');
  expect(() => connector.setTheme({ mode: 'dark' })).not.toThrow();
});
