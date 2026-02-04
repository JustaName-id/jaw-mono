import { useState, useEffect } from 'react';
import { fetchTokenPrice } from '../utils/tokenPrice';

/**
 * Hook to fetch and cache the current price in USD for a token by its symbol
 * Uses CryptoCompare API with a 5-minute cache
 * @param symbol - The token symbol (ETH, AVAX, BNB, USDC, etc.)
 * @returns The current token price in USD, or 0 if not yet fetched/failed
 */
export function useFeeTokenPrice(symbol?: string): number {
  const [price, setPrice] = useState<number>(0);

  useEffect(() => {
    if (!symbol) {
      setPrice(0);
      return;
    }

    let isMounted = true;

    const getPrice = async () => {
      const fetchedPrice = await fetchTokenPrice(symbol);
      if (isMounted) {
        setPrice(fetchedPrice);
      }
    };

    getPrice();

    return () => {
      isMounted = false;
    };
  }, [symbol]);

  return price;
}
