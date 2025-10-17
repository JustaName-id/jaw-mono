
export type Address = `0x${string}`;

export interface AppMetadata {
    /** Application name */
    appName: string;
    /** Application logo image URL; favicon is used if unspecified */
    appLogoUrl: string | null;
    /** Array of chainIds your dapp supports */
    appChainIds: number[];
  }

export type Preference = {
    /**
     * The URL for the keys popup.
     * By default, `https://keys.jaw.id/` is used for production
     * @type {string}
     */
    keysUrl?: string;
    /**
     * @param mode 'cross-platform' | 'app-specific'
     */
    mode: 'cross-platform' | 'app-specific';

  } & Record<string, unknown>;


export type Chain = {
    id: number;
    rpcUrl?: string;
    nativeCurrency?: {
      name?: string;
      symbol?: string;
      decimal?: number;
    };
  };
  

export type Account = {
    accounts?: Address[];
    capabilities?: Record<string, unknown>;
    chain?: Chain;
};


export type Config = {
    metadata?: AppMetadata;
    preference?: Preference;
    version: string;
    deviceId?: string;
    paymasterUrls?: Record<number, string>;
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
  
  export type MergeTypes<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? First & (Rest extends unknown[] ? MergeTypes<Rest> : Record<string, unknown>)
  : Record<string, unknown>;


  export type StoreState = MergeTypes<
  [
    ChainSlice,
    KeysSlice,
    AccountSlice,
    ConfigSlice,
  ]
>;