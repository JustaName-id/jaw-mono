'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Spinner } from '../ui/spinner';
import { cn } from '../../lib/utils';

export interface FeeTokenOption {
  uid: string;
  symbol: string;
  address: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
  isNative: boolean;
  isSelectable: boolean;
}

interface FeeTokenSelectorProps {
  tokens: FeeTokenOption[];
  selectedToken: FeeTokenOption | null;
  onSelect: (token: FeeTokenOption) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export const FeeTokenSelector = ({
  tokens,
  selectedToken,
  onSelect,
  isLoading,
  disabled,
}: FeeTokenSelectorProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3" />
        <span>Loading payment options...</span>
      </div>
    );
  }

  // Don't render if no ERC-20 tokens available (only native)
  const hasErc20Options = tokens.some(t => !t.isNative);
  if (!hasErc20Options) {
    return null;
  }

  const handleValueChange = (address: string) => {
    const token = tokens.find(t => t.address === address);
    if (token && token.isSelectable) {
      onSelect(token);
    }
  };

  // Format balance for display (max 6 decimal places)
  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.000001) return '<0.000001';
    return num.toFixed(Math.min(6, balance.split('.')[1]?.length || 0));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">Pay with</p>
      <Select
        value={selectedToken?.address || ''}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full h-9 text-sm">
          <SelectValue placeholder="Select token">
            {selectedToken && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{selectedToken.symbol}</span>
                <span className="text-muted-foreground">
                  ({formatBalance(selectedToken.balanceFormatted)})
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tokens.map((token) => (
            <SelectItem
              key={token.address}
              value={token.address}
              disabled={!token.isSelectable}
              className={cn(
                'flex items-center justify-between',
                !token.isSelectable && 'opacity-50'
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className="font-medium">{token.symbol}</span>
                <span className="text-muted-foreground text-xs ml-auto">
                  {formatBalance(token.balanceFormatted)}
                </span>
                {!token.isSelectable && (
                  <span className="text-xs text-destructive ml-1">
                    (insufficient)
                  </span>
                )}
                {token.isNative && (
                  <span className="text-xs text-muted-foreground ml-1">
                    (default)
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
