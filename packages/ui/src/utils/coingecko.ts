// ============================================================================
// ETH Price Fetching
// ============================================================================

// Price cache with TTL
let ethPriceCache: { price: number; timestamp: number } | null = null;
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the current ETH price in USD from CoinGecko API
 * Results are cached for 5 minutes to reduce API calls
 * @returns Promise<number> - The ETH price in USD, or 0 if fetch fails
 */
export async function fetchEthPrice(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.timestamp < PRICE_CACHE_TTL) {
    return ethPriceCache.price;
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data.ethereum?.usd ?? 0;

    ethPriceCache = { price, timestamp: Date.now() };
    return price;
  } catch (error) {
    console.warn('Failed to fetch ETH price:', error);
    return ethPriceCache?.price ?? 0;
  }
}

/**
 * Clears the ETH price cache (useful for testing or forcing refresh)
 */
export function clearEthPriceCache(): void {
  ethPriceCache = null;
}
