import React, { useMemo, useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native';
import { fetchChainIcon } from '../utils/coingecko';

/**
 * Custom hook to display chain icons in React Native
 * Fetches chain icons from CoinGecko API with fallback element
 * @param chain - The chain name (e.g., 'ethereum', 'base', 'arbitrum')
 * @param size - The size of the icon in pixels (default: 24)
 * @returns React.ReactElement - The chain icon or a fallback element
 */
export const useChainIcon = (
  chain: string,
  size?: number
): React.ReactElement => {
  const iconSize = size ?? 24;
  const safeChain = chain || 'ethereum';
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch icon from CoinGecko API
  useEffect(() => {
    let isMounted = true;

    const loadIcon = async () => {
      setIsLoading(true);
      try {
        const url = await fetchChainIcon(safeChain);
        if (isMounted) {
          setIconUrl(url);
          setIsLoading(false);
        }
      } catch (error) {
        console.warn(
          `Failed to fetch icon for ${safeChain}, using fallback`,
          error
        );
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
  }, [safeChain]);

  // Memoize the component to prevent unnecessary re-renders
  const icon = useMemo(() => {
    // If we have a URL from CoinGecko, use it
    if (iconUrl) {
      return (
        <Image
          source={{ uri: iconUrl }}
          style={[
            styles.image,
            {
              width: iconSize,
              height: iconSize,
              minWidth: iconSize,
            },
          ]}
          accessibilityLabel={`${safeChain} icon`}
        />
      );
    }

    // Show loading state or fallback
    return (
      <View
        style={[
          styles.fallback,
          {
            backgroundColor: isLoading ? '#f0f0f0' : '#e0e0e0',
            height: iconSize,
            width: iconSize,
            minWidth: iconSize,
          },
        ]}
      >
        <Text
          style={[
            styles.fallbackText,
            {
              fontSize: Math.max(10, iconSize / 3),
            },
          ]}
        >
          {isLoading ? '...' : '?'}
        </Text>
      </View>
    );
  }, [iconUrl, safeChain, iconSize, isLoading]);

  return icon;
};

const styles = StyleSheet.create({
  image: {
    borderRadius: 9999,
  },
  fallback: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#666',
    textAlign: 'center',
  },
});
