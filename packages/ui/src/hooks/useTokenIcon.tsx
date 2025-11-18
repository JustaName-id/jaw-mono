import {JSX, useMemo, useEffect, useState} from 'react';
import { fetchTokenIcon } from '../utils/coingecko';

/**
 * Custom hook to display token icons
 * Fetches token icons from CoinGecko API with fallback element
 * @param tokenSymbol - The token symbol (e.g., 'ETH', 'USDC', 'DAI')
 * @param size - The size of the icon in pixels (default: 24)
 * @returns JSX.Element - The token icon or a fallback element
 */
export const useTokenIcon = (tokenSymbol: string, size?: number): JSX.Element => {
  const iconSize = size ?? 24;
  const safeSymbol = tokenSymbol || 'ETH';
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch icon from CoinGecko API
  useEffect(() => {
    let isMounted = true;

    const loadIcon = async () => {
      setIsLoading(true);
      try {
        const url = await fetchTokenIcon(safeSymbol);
        if (isMounted) {
          setIconUrl(url);
          setIsLoading(false);
        }
      } catch (error) {
        console.warn(`Failed to fetch icon for ${safeSymbol}, using fallback`, error);
        if (isMounted) {
          setIconUrl(null);
          setIsLoading(false);
        }
      }
    };

    loadIcon();

    return () => {
      isMounted = false;
    };
  }, [safeSymbol]);

  // Memoize the JSX to prevent unnecessary re-renders
  const icon = useMemo(() => {
    // If we have a URL from CoinGecko, use it
    if (iconUrl) {
      return (
        <img
          src={iconUrl}
          alt={`${safeSymbol} icon`}
          style={{ width: iconSize, height: iconSize, minWidth: iconSize, borderRadius: '50%' }}
        />
      );
    }

    // Show loading state or fallback
    return (
      <div
        style={{
          backgroundColor: isLoading ? '#f0f0f0' : '#e0e0e0',
          borderColor: '#ccc',
          border: '1px solid #ccc',
          display: 'flex',
          height: `${iconSize}px`,
          width: `${iconSize}px`,
            minWidth: `${iconSize}px`,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          borderRadius: '50%',
          fontSize: `${Math.max(10, iconSize / 3)}px`,
          color: '#666',
          fontWeight: 'bold',
        }}
      >
        {isLoading ? '...' : safeSymbol.charAt(0).toUpperCase()}
      </div>
    );
  }, [iconUrl, safeSymbol, iconSize, isLoading]);

  return icon;
};