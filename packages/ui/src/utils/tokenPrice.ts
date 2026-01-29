// ============================================================================
// Token Price Fetching (using CryptoCompare API)
// ============================================================================

// Price cache with TTL per symbol
const tokenPriceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches the current price in USD for a token by its symbol from CryptoCompare API
 * Results are cached for 5 minutes per symbol to reduce API calls
 * @param symbol - The token symbol (ETH, AVAX, BNB, USDC, etc.)
 * @returns Promise<number> - The token price in USD, or 0 if fetch fails
 */
export async function fetchTokenPrice(symbol: string): Promise<number> {
  if (!symbol) return 0;

  // Normalize symbol (remove special characters like ₮)
  const normalizedSymbol = symbol.replace(/[₮]/g, 'T').toUpperCase();

  const cached = tokenPriceCache.get(normalizedSymbol);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=${normalizedSymbol}&tsyms=USD`
    );

    if (!response.ok) {
      throw new Error(`CryptoCompare API error: ${response.status}`);
    }

    const data = await response.json();

    // CryptoCompare returns { "USD": price } or { "Response": "Error", ... }
    if (data.Response === 'Error') {
      console.warn(`CryptoCompare error for ${normalizedSymbol}:`, data.Message);
      return cached?.price ?? 0;
    }

    const price = data.USD ?? 0;

    tokenPriceCache.set(normalizedSymbol, { price, timestamp: Date.now() });
    return price;
  } catch (error) {
    console.warn(`Failed to fetch ${normalizedSymbol} price:`, error);
    return cached?.price ?? 0;
  }
}

/**
 * Clears all token price caches (useful for testing or forcing refresh)
 */
export function clearTokenPriceCache(): void {
  tokenPriceCache.clear();
}
