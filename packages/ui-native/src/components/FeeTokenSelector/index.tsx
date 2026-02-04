import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  SafeAreaView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { cn } from '../../lib/utils';
import { ChevronDownIcon, CheckIcon, EthIcon, UsdcIcon, UsdtIcon, GenericTokenIcon } from '../../icons';
import type { FeeTokenOption } from '../../hooks/useGasEstimation';

export type { FeeTokenOption } from '../../hooks/useGasEstimation';

interface FeeTokenSelectorProps {
  tokens: FeeTokenOption[];
  selectedToken: FeeTokenOption | null;
  onSelect: (token: FeeTokenOption) => void;
  isLoading: boolean;
  disabled?: boolean;
  ethPrice?: number;
  estimatedGasEth?: string;
}

// Get token icon - use logoURI if available, otherwise fall back to symbol-based icons
const getTokenIcon = (symbol: string, logoURI?: string, size = 32) => {
  // Use logoURI if available
  if (logoURI) {
    return (
      <Image
        source={{ uri: logoURI }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }

  // Fallback to symbol-based icons
  switch (symbol.toUpperCase()) {
    case 'ETH':
      return <EthIcon width={size} height={size} />;
    case 'USDC':
      return <UsdcIcon width={size} height={size} />;
    case 'USDT':
      return <UsdtIcon width={size} height={size} />;
    default:
      return <GenericTokenIcon width={size} height={size} />;
  }
};

// Format balance for display (max 6 decimal places, min 4 for small values)
const formatBalance = (balance: string, symbol: string) => {
  const num = parseFloat(balance);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  // For ETH, show more decimals; for stablecoins, show 2
  const decimals = symbol.toUpperCase() === 'ETH' ? 6 : 2;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

export const FeeTokenSelector: React.FC<FeeTokenSelectorProps> = ({
  tokens,
  selectedToken,
  onSelect,
  isLoading,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (token: FeeTokenOption) => {
    if (!token.isSelectable) return;
    onSelect(token);
    setIsOpen(false);
  };

  // Show loading state
  if (isLoading) {
    return (
      <View className="flex-row items-center justify-between h-12 px-3 rounded-md border border-border bg-background">
        <Text className="text-sm text-muted-foreground">Loading tokens...</Text>
        <ActivityIndicator size="small" color="#71717A" />
      </View>
    );
  }

  // Filter tokens to show (only selectable or currently selected)
  const displayTokens = tokens.filter(t => t.isSelectable || t.address === selectedToken?.address);

  return (
    <>
      <Pressable
        className={cn(
          'flex-row items-center justify-between h-12 px-3 rounded-md border border-border bg-background',
          disabled && 'opacity-50'
        )}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
      >
        {selectedToken ? (
          <View className="flex-row items-center gap-2 flex-1">
            {getTokenIcon(selectedToken.symbol, selectedToken.logoURI, 24)}
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                {selectedToken.symbol}
              </Text>
              {selectedToken.gasCostFormatted && (
                <Text className="text-xs text-muted-foreground">
                  ≈ {selectedToken.gasCostFormatted} {selectedToken.symbol}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <Text className="text-sm text-muted-foreground">Select token</Text>
        )}
        <ChevronDownIcon width={16} height={16} stroke="#71717A" />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-end"
          onPress={() => setIsOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <SafeAreaView className="bg-background rounded-t-xl">
              <View className="p-4 border-b border-border">
                <Text className="text-lg font-semibold text-foreground text-center">
                  Select Fee Token
                </Text>
                <Text className="text-xs text-muted-foreground text-center mt-1">
                  Choose how you want to pay for gas
                </Text>
              </View>

              <FlatList
                data={displayTokens}
                keyExtractor={(item) => item.address}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable
                    className={cn(
                      'flex-row items-center justify-between px-4 py-3 border-b border-border',
                      !item.isSelectable && 'opacity-50'
                    )}
                    onPress={() => handleSelect(item)}
                    disabled={!item.isSelectable}
                  >
                    <View className="flex-row items-center gap-3 flex-1">
                      {getTokenIcon(item.symbol, item.logoURI, 32)}
                      <View className="flex-1">
                        <Text
                          className={cn(
                            'text-base font-medium',
                            item.address === selectedToken?.address
                              ? 'text-primary'
                              : 'text-foreground'
                          )}
                        >
                          {item.symbol}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Balance: {formatBalance(item.balanceFormatted, item.symbol)}
                        </Text>
                        {item.gasCostFormatted && (
                          <Text className="text-xs text-muted-foreground mt-0.5">
                            Gas: ≈ {item.gasCostFormatted} {item.symbol}
                          </Text>
                        )}
                      </View>
                    </View>

                    {item.address === selectedToken?.address && (
                      <CheckIcon width={20} height={20} stroke="#3B82F6" />
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View className="p-8 items-center">
                    <Text className="text-sm text-muted-foreground text-center">
                      No tokens available
                    </Text>
                  </View>
                }
              />
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};
