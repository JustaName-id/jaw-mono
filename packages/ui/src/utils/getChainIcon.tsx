import { chains } from '@justweb3/ui';
import { JSX } from 'react';

export const getChainIcon = (chain: string, size?: number): JSX.Element => {
  const convertedChain = (() => {
    switch (chain) {
      case 'mainnet':
        return 'eth';
      case 'ethereum':
        return 'eth';
      case 'sepolia':
        return 'eth';
      case 'arbitrum':
        return 'arb1'
      case 'base':
        return 'base'
      case 'base-sepolia':
        return 'base'
      case 'optimism':
        return 'op'
      case 'polygon':
        return 'matic'
      default:
        return chain.toLowerCase();
    }
  })();
  const Icon = chains[convertedChain as keyof typeof chains];

  if (Icon) {
    return <Icon width={size ?? 24} height={size ?? 24} />;
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderColor: 'black',
        display: 'flex',
        height: `${size ?? 24}px`,
        width: `${size ?? 24}px`,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        borderRadius: '50%',
      }}
    >
      ?
    </div>
  );
};
