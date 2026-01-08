import { Address , AppMetadata , JawProviderPreference} from "../provider/interface.js";
import type { WalletConnectResponse } from '../rpc/index.js';




/**
 * Paymaster configuration for a chain
 */
export type PaymasterConfig = {
    /** The paymaster RPC URL */
    url: string;
    /** Optional context to pass to paymaster calls (e.g., sponsorshipPolicyId for Pimlico) */
    context?: Record<string, unknown>;
  };

export type Chain = {
    id: number;
    rpcUrl?: string;
    nativeCurrency?: {
      name?: string;
      symbol?: string;
      decimal?: number;
    };
    /** Optional paymaster configuration for sponsored transactions */
    paymaster?: PaymasterConfig;
  };
  

export type Account = {
    accounts?: Address[];
    capabilities?: WalletConnectResponse['accounts'][number]['capabilities'];
    chain?: Chain;
};


export type Config = {
    metadata?: AppMetadata;
    preference?: JawProviderPreference;
    version: string;
    deviceId?: string;
    apiKey?: string;
    /** Mapping of chain IDs to paymaster configuration */
    paymasters?: Record<number, PaymasterConfig>;
  };
  

  export type ChainSlice = {
    chains: Chain[];
  };

  export type ConfigSlice = {
    config: Config;
  };
  

  export type KeysSlice = {
    keys: Record<string, string | null>;
  };

  export type AccountSlice = {
    account: Account;
  };

  export type CallStatus = {
    status: 'pending' | 'failed' | 'completed';
    receipts?: unknown[];
    chainId?: number;
    error?: string;
  };

  export type CallStatusSlice = {
    callStatuses: Record<string, CallStatus>;
  };
  
  export type MergeTypes<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? First & (Rest extends unknown[] ? MergeTypes<Rest> : Record<string, unknown>)
  : Record<string, unknown>;


  export type StoreState = MergeTypes<
  [
    ChainSlice,
    KeysSlice,
    AccountSlice,
    ConfigSlice,
    CallStatusSlice,
  ]
>;