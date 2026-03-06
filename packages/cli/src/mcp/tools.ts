import { z } from "zod";

/**
 * Single generic RPC method schema.
 * Accepts any EIP-1193 RPC method and forwards to JAWProvider.
 */
export const rpcMethodSchema = {
  method: z
    .string()
    .describe(
      "EIP-1193 RPC method name. Supported methods: " +
        "eth_requestAccounts, eth_accounts, eth_chainId, net_version, " +
        "wallet_connect, wallet_disconnect, wallet_switchEthereumChain, " +
        "wallet_sendCalls, eth_sendTransaction, wallet_getCallsStatus, wallet_getCallsHistory, " +
        "personal_sign, eth_signTypedData_v4, wallet_sign, " +
        "wallet_grantPermissions, wallet_revokePermissions, wallet_getPermissions, " +
        "wallet_getCapabilities, wallet_getAssets",
    ),
  params: z
    .any()
    .optional()
    .describe(
      "Method parameters — structure varies by method. See https://docs.jaw.id/api-reference",
    ),
  chainId: z
    .number()
    .optional()
    .describe(
      "Target chain ID (overrides default). E.g., 1 for Ethereum, 8453 for Base, 84532 for Base Sepolia",
    ),
};

export const configSetSchema = {
  key: z
    .enum(["apiKey", "defaultChain", "keysUrl", "paymasterUrl"])
    .describe("Config key"),
  value: z.string().describe("Config value"),
};
