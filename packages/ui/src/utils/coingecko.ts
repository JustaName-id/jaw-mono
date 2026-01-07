// Chain name to CoinGecko API ID mapping
const CHAIN_TO_COINGECKO_ID: Record<string, string> = {
  mainnet: 'ethereum',
  ethereum: 'ethereum',
  eth: 'ethereum',
  sepolia: 'ethereum',
  arbitrum: 'arbitrum',
  arb1: 'arbitrum',
  base: 'base',
  'base-sepolia': 'base',
  optimism: 'optimism',
  op: 'optimism',
  polygon: 'matic-network',
  matic: 'matic-network',
};

// In-memory cache for icon URLs
const iconCache = new Map<string, string>();

// Cache for failed lookups to avoid repeated failed requests
const failedCache = new Set<string>();

interface CoinGeckoResponse {
  id: string;
  symbol: string;
  name: string;
  image: {
    thumb: string;
    small: string;
    large: string;
  };
}

/**
 * Fetches the chain icon URL from CoinGecko API
 * @param chain - The chain name (e.g., 'ethereum', 'base', 'arbitrum')
 * @returns Promise<string | null> - The icon URL or null if not found
 */
export async function fetchChainIcon(chain: string): Promise<string | null> {
  const lowerChain = chain.toLowerCase();

  // Check cache first
  if (iconCache.has(lowerChain)) {
    return iconCache.get(lowerChain)!;
  }

  // Check if this chain previously failed
  if (failedCache.has(lowerChain)) {
    return null;
  }

  // Map chain name to CoinGecko ID
  const coinGeckoId = CHAIN_TO_COINGECKO_ID[lowerChain] || lowerChain;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinGeckoId}`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data: CoinGeckoResponse = await response.json();

    // Always use 'small' size as per requirements
    const iconUrl = data.image.small;

    // Cache the result
    iconCache.set(lowerChain, iconUrl);

    return iconUrl;
  } catch (error) {
    console.warn(`Failed to fetch icon for chain "${chain}":`, error);

    // Mark as failed to avoid repeated requests
    failedCache.add(lowerChain);

    return null;
  }
}

/**
 * Clears the icon cache (useful for testing or forcing refresh)
 */
export function clearIconCache(): void {
  iconCache.clear();
  failedCache.clear();
}

/**
 * Pre-populate cache with icon URL (useful for SSR or pre-fetching)
 */
export function setCachedIcon(chain: string, iconUrl: string): void {
  iconCache.set(chain.toLowerCase(), iconUrl);
}

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
