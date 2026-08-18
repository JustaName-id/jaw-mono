import baseConfig from '../../eslint.config.mjs';

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
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name='mock'] Property[key.name=/^(encodeAbiParameters|decodeAbiParameters|encodePacked|encodeFunctionData|decodeFunctionResult|padHex|pad|numberToHex|hexToNumber|stringToHex|hexToString|toHex|fromHex|concat|size|slice|hashTypedData|hashMessage|keccak256|parseSignature|serializeSignature)$/]",
          message:
            'Do not stub viem/ox encoders in the signing layer. Assert the bytes that come out (decodeAbiParameters round-trips them) instead of asserting how viem was called.',
        },
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name='mock'][arguments.0.value=/^(ox\\/|viem\\/experimental\\/erc7739)/]",
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
