import { z } from 'zod';

/**
 * Single generic RPC method schema.
 * Accepts any EIP-1193 RPC method and forwards to JAWProvider.
 */
export const rpcMethodSchema = {
  method: z
    .string()
    .describe(
      'EIP-1193 RPC method name (e.g. wallet_connect, wallet_sendCalls, personal_sign). ' +
        'Read the jaw://api-reference resource for the full list and jaw://api-reference/{method} for parameter details.'
    ),
  params: z
    .any()
    .optional()
    .describe(
      'Method parameters — structure varies by method. ' +
        'Read the jaw://api-reference/{method} resource for the expected format.'
    ),
  chainId: z
    .number()
    .optional()
    .describe('Target chain ID (overrides default). E.g., 1 for Ethereum, 8453 for Base, 84532 for Base Sepolia'),
  session: z
    .boolean()
    .optional()
    .describe(
      'Sign with the local session key instead of opening the browser (requires `jaw session setup`; ' +
        'check jaw_session_status first). Supported methods only: eth_requestAccounts, eth_accounts, ' +
        'wallet_sendCalls, wallet_getCallsStatus, personal_sign, eth_signTypedData_v4. ' +
        'Defaults to the JAW_SESSION env var.'
    ),
};

export const configSetSchema = {
  key: z.enum(['apiKey', 'defaultChain', 'keysUrl', 'ens', 'relayUrl', 'sessionExpiry']).describe('Config key'),
  value: z.string().describe('Config value'),
};
