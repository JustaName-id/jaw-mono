import { PublicClient } from 'viem';
import { BundlerClient, PaymasterClient } from 'viem/account-abstraction';
import { createStore } from 'zustand/vanilla';

export type ChainClientState = {
  [key: number]: {
    client: PublicClient;
    bundlerClient: BundlerClient;
    paymasterClient: PaymasterClient;
  };
};

export const ChainClients = createStore<ChainClientState>(() => ({}));
