import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

const config = [
  ...fixupConfigRules(compat.extends('next')),
  ...fixupConfigRules(compat.extends('next/core-web-vitals')),
  ...baseConfig,
  ...nx.configs['flat/react-typescript'],
  {
    ignores: ['.next/**/*', '**/out-tsc', 'next-env.d.ts'],
  },
  {
    // Transport-safety gates (dev-specs keys-iframe-transport/contracts/wire-messages.md):
    // window.close() is a no-op inside the embedded iframe and wildcard
    // postMessage targets break origin locking.
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/lib/popup-communicator.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'close',
          message:
            'Use communicator.requestClose() — window.close() is a no-op when keys runs inside the embedded iframe.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='postMessage'] Literal[value='*']",
          message: "Never post with a '*' target origin — use the locked counterpart origin.",
        },
      ],
    },
  },
];

export default config;
