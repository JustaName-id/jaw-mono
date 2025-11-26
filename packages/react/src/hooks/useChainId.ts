import { useState, useEffect } from 'react';
import { useJAWProvider } from '../context';

export function useChainId(): number | null {
  const provider = useJAWProvider();
  const [chainId, setChainId] = useState<number | null>(null);

  useEffect(() => {
    // Get initial chain ID
    provider.request({ method: 'eth_chainId' })
      .then((id) => {
        const hexChainId = id as string;
        setChainId(parseInt(hexChainId, 16));
      })
      .catch(() => setChainId(null));

    // Listen for chain changes
    const handleChainChanged = (hexChainId: string) => {
      setChainId(parseInt(hexChainId, 16));
    };

    provider.on('chainChanged', handleChainChanged);

    return () => {
      provider.off('chainChanged', handleChainChanged);
    };
  }, [provider]);

  return chainId;
}