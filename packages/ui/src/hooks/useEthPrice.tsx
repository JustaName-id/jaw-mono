import { useState, useEffect } from 'react';
import { fetchEthPrice } from '../utils/coingecko';

/**
 * Hook to fetch and cache the current ETH price in USD
 * Uses CoinGecko API with a 5-minute cache
 * @returns The current ETH price in USD, or 0 if not yet fetched/failed
 */
export function useEthPrice(): number {
  const [ethPrice, setEthPrice] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;

    const getPrice = async () => {
      const price = await fetchEthPrice();
      if (isMounted) {
        setEthPrice(price);
      }
    };

    getPrice();

    return () => {
      isMounted = false;
    };
  }, []);

  return ethPrice;
}
