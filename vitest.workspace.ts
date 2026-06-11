import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/core/vitest.config.ts',
  'packages/wagmi/vitest.config.ts',
  'apps/keys-jaw-id/vitest.config.ts',
]);
