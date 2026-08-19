import baseConfig from '../../eslint.config.mjs';

/**
 * Functions whose output is bytes a contract reads. Stubbing one of these in a
 * signing-layer test replaces the thing under test, so the rule below bans it.
 */
const ENCODERS = [
  'encodeAbiParameters',
  'decodeAbiParameters',
  'encodePacked',
  'encodeFunctionData',
  'decodeFunctionResult',
  'padHex',
  'pad',
  'numberToHex',
  'hexToNumber',
  'stringToHex',
  'hexToString',
  'toHex',
  'fromHex',
  'concat',
  'size',
  'slice',
  'hashTypedData',
  'hashMessage',
  'keccak256',
  'parseSignature',
  'serializeSignature',
].join('|');

/** `vi.mock('viem'…)` or `vi.doMock('ox/Signature'…)`, in any of their spellings. */
const MOCKS_A_BYTE_MODULE =
  "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.value=/^(viem|ox)/]";

/** A property in the mock factory, whether the key is written bare or quoted. */
const ENCODER_KEYS = `Property[key.name=/^(${ENCODERS})$/], Property[key.value=/^(${ENCODERS})$/]`;

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          ignoredDependencies: ['vitest', 'viem', 'tsup', 'tslib'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  {
    // The signing layer turns values into bytes that an audited contract
    // decodes. A test that stubs the encoder checks which arguments we passed
    // to viem, which is a mirror of the implementation: reorder a tuple field
    // and both sides move together while the on-chain decode breaks. Mocking
    // the client or the network around it is fine, mocking what produces the
    // bytes is not.
    files: ['src/account/**/*.test.ts', 'src/signer/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Both `mock` and `doMock`, and both bare and quoted keys, or the ban is
        // a speed bump anyone steps over by accident. Scoped to viem and ox
        // arguments so a local module with a `size` or `pad` field is not caught
        // by a message about encoders.
        {
          selector: `${MOCKS_A_BYTE_MODULE} :matches(${ENCODER_KEYS})`,
          message:
            'Do not stub viem/ox encoders in the signing layer. Assert the bytes that come out (decodeAbiParameters round-trips them) instead of asserting how viem was called.',
        },
        {
          selector: `${MOCKS_A_BYTE_MODULE}[arguments.0.value=/^(ox\\/|viem\\/experimental\\/erc7739)/]`,
          message:
            'Do not stub ox or the ERC-7739 helpers in the signing layer. These exist only to produce bytes and hashes, so replacing them removes the thing under test.',
        },
      ],
    },
  },
  {
    ignores: ['**/out-tsc'],
  },
];
