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

// Token symbol to CoinGecko API ID mapping
const TOKEN_TO_COINGECKO_ID: Record<string, string> = {
  eth: 'ethereum',
  weth: 'weth',
  usdc: 'usd-coin',
  usdt: 'tether',
  dai: 'dai',
  wbtc: 'wrapped-bitcoin',
  uni: 'uniswap',
  link: 'chainlink',
  aave: 'aave',
  matic: 'matic-network',
  op: 'optimism',
  arb: 'arbitrum',
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
 * Fetches the token icon URL from CoinGecko API
 * @param tokenSymbol - The token symbol (e.g., 'ETH', 'USDC', 'DAI')
 * @returns Promise<string | null> - The icon URL or null if not found
 */
export async function fetchTokenIcon(tokenSymbol: string): Promise<string | null> {
  const lowerSymbol = tokenSymbol.toLowerCase();
  const cacheKey = `token_${lowerSymbol}`;

  // Check cache first
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }

  // Check if this token previously failed
  if (failedCache.has(cacheKey)) {
    return null;
  }

  // Map token symbol to CoinGecko ID
  const coinGeckoId = TOKEN_TO_COINGECKO_ID[lowerSymbol] || lowerSymbol;

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
    iconCache.set(cacheKey, iconUrl);

    return iconUrl;
  } catch (error) {
    console.warn(`Failed to fetch icon for token "${tokenSymbol}":`, error);

    // Mark as failed to avoid repeated requests
    failedCache.add(cacheKey);

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
