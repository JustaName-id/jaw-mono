import { Chain, createPublicClient, http } from 'viem';
import {createBundlerClient, createPaymasterClient} from 'viem/account-abstraction';
import { arbitrum, arbitrumSepolia, base, baseSepolia, mainnet, optimism, optimismSepolia, sepolia } from "viem/chains"


 
  export interface chain {
    id: number;
    rpcUrl: string;
    paymasterUrl?: string;
  }

  const chains: Record<number, Chain> = {
    [arbitrum.id]: arbitrum,
    [base.id]: base,
    [optimism.id]: optimism,
    [mainnet.id]: mainnet,
    [sepolia.id]: sepolia,
    [arbitrumSepolia.id]: arbitrumSepolia,
    [baseSepolia.id]: baseSepolia,
    [optimismSepolia.id]: optimismSepolia,
  } as const;

export const createClient = (chain: chain) => {
  const client = createPublicClient({
    chain: chains[chain.id],
    transport: http(chain.rpcUrl),
  });
  const bundlerOptions: any = {
    client,
    transport: http(chain.rpcUrl),
  };
  
  if (chain.paymasterUrl) {
    bundlerOptions.paymaster = createPaymasterClient({
      transport: http(chain.paymasterUrl),
    });
  }
  
  return createBundlerClient(bundlerOptions);
}