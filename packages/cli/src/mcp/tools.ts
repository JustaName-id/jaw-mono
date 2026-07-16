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

export const payAndFetchSchema = {
  url: z.string().url().describe('Resource URL to fetch. If it answers HTTP 402 (x402), pay and retry.'),
  method: z.string().optional().describe('HTTP method (default GET).'),
  headers: z.record(z.string()).optional().describe('Extra request headers.'),
  body: z.string().optional().describe('Request body (for POST/PUT/etc.).'),
  maxAmount: z
    .string()
    .optional()
    .describe(
      'Hard ceiling for THIS call, in the asset base units (e.g. 6-decimals for USDC). ' +
        'If the 402 asks for more, the payment is refused, not made.'
    ),
  asset: z.string().optional().describe('Require a specific asset contract address.'),
  network: z.string().optional().describe('Require a specific CAIP-2 network, e.g. eip155:8453 (Base).'),
};
