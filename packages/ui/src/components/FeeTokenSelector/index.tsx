'use client'

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { EthIcon, UsdcIcon, UsdtIcon, GenericTokenIcon } from '../../icons';
import { cn } from '../../lib/utils';
import { ChevronDown, X } from 'lucide-react';

export interface FeeTokenOption {
  uid: string;
  symbol: string;
  address: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
  isNative: boolean;
  isSelectable: boolean;
  // Optional: USD values for display
  balanceUsd?: string;
  gasCostUsd?: string;
  gasCostFormatted?: string;
  // Optional: Token logo URI from API
  logoURI?: string;
}

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
const getTokenIcon = (symbol: string, className?: string, logoURI?: string) => {
  const iconClass = cn('size-8 shrink-0', className);

  // Use logoURI if available
  if (logoURI) {
    return (
      <img
        src={logoURI}
        alt={symbol}
        className={cn(iconClass, 'rounded-full object-cover')}
        onError={(e) => {
          // Fallback to generic icon if image fails to load
          e.currentTarget.style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  // Fallback to symbol-based icons
  switch (symbol.toUpperCase()) {
    case 'ETH':
      return <EthIcon className={iconClass} />;
    case 'USDC':
      return <UsdcIcon className={iconClass} />;
    case 'USDT':
      return <UsdtIcon className={iconClass} />;
    default:
      return <GenericTokenIcon className={iconClass} />;
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

// Format USD value (show at least 4 decimals for small gas amounts)
const formatUsd = (value: number) => {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })}`;
};

export const FeeTokenSelector = ({
  tokens,
  selectedToken,
  onSelect,
  isLoading,
  disabled,
  ethPrice = 0,
  estimatedGasEth,
}: FeeTokenSelectorProps) => {
  const [open, setOpen] = useState(false);

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

  const nativeToken = tokens.find(t => t.isNative);
  const erc20Tokens = tokens.filter(t => !t.isNative);

  const handleSelect = (token: FeeTokenOption) => {
    if (token.isSelectable) {
      onSelect(token);
      setOpen(false);
    }
  };

  // Calculate USD values for tokens
  const getBalanceUsd = (token: FeeTokenOption): string => {
    if (token.isNative && ethPrice > 0) {
      const usd = parseFloat(token.balanceFormatted) * ethPrice;
      return formatUsd(usd);
    }
    // For non-native ERC-20 tokens, show balance with token decimals
    if (!token.isNative) {
      const balance = parseFloat(token.balanceFormatted);
      // Show appropriate decimal places based on token decimals
      const displayDecimals = token.decimals >= 6 ? 2 : token.decimals;
      return `${balance.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: displayDecimals,
      })} ${token.symbol}`;
    }
    return '';
  };

  // Get gas cost for a token
  // For ERC-20 tokens, use pre-computed gasCostFormatted if available (from paymaster quote)
  const getGasCost = (token: FeeTokenOption): { formatted: string; usd: string } => {
    // If token has pre-computed gas cost (from paymaster quote), use that
    if (token.gasCostFormatted) {
      // For stablecoins, the token cost ≈ USD cost
      const tokenCost = parseFloat(token.gasCostFormatted.replace(/[^0-9.]/g, ''));
      return {
        formatted: token.gasCostFormatted,
        usd: ['USDC', 'USDT', 'DAI'].includes(token.symbol.toUpperCase())
          ? formatUsd(tokenCost)
          : '',
      };
    }

    // Fallback: calculate from ETH gas estimate
    if (!estimatedGasEth || !ethPrice) {
      return { formatted: '', usd: '' };
    }

    const gasEth = parseFloat(estimatedGasEth);
    const gasUsd = gasEth * ethPrice;

    if (token.isNative) {
      return {
        formatted: `${formatBalance(estimatedGasEth, token.symbol)} ${token.symbol}`,
        usd: formatUsd(gasUsd),
      };
    }

    // For non-native ERC-20 tokens, gas cost in token
    // Show appropriate decimal places based on token decimals
    const displayDecimals = token.decimals >= 6 ? 3 : token.decimals;
    return {
      formatted: `${gasUsd.toFixed(displayDecimals)} ${token.symbol}`,
      usd: formatUsd(gasUsd),
    };
  };

  // Token row component
  const TokenRow = ({ token, showGasCost = true }: { token: FeeTokenOption; showGasCost?: boolean }) => {
    const balanceUsd = getBalanceUsd(token);
    const gasCost = showGasCost ? getGasCost(token) : null;
    const isSelected = selectedToken?.address === token.address;

    return (
      <button
        onClick={() => handleSelect(token)}
        disabled={!token.isSelectable || disabled}
        className={cn(
          'w-full flex items-center gap-2 px-2 py-2 rounded-md transition-colors',
          'hover:bg-muted/60',
          isSelected && 'bg-zinc-200',
          !token.isSelectable && 'opacity-50 cursor-not-allowed',
          token.isSelectable && 'cursor-pointer'
        )}
      >
        {/* Token Icon */}
        {getTokenIcon(token.symbol, 'size-6', token.logoURI)}

        {/* Token Info */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1">
            <span className={cn("font-semibold text-xs", isSelected && "text-foreground")}>{token.symbol}</span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            Bal: {balanceUsd || `${formatBalance(token.balanceFormatted, token.symbol)} ${token.symbol}`}
          </div>
        </div>

        {/* Gas Cost / Amount - only show for native tokens */}
        <div className="text-right shrink-0">
          {gasCost?.usd && (
            <>
              <div className="font-semibold text-xs">{gasCost.usd}</div>
              <div className="text-[10px] text-muted-foreground">Up to {gasCost.formatted}</div>
            </>
          )}
          {!token.isSelectable && (
            <span className="text-[10px] text-destructive">(insufficient)</span>
          )}
        </div>
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-7 px-2 gap-1 text-xs font-medium rounded-md border-muted-foreground/30"
        >
          {selectedToken && getTokenIcon(selectedToken.symbol, 'size-3.5', selectedToken.logoURI)}
          <span>{selectedToken?.symbol || 'Select'}</span>
          <ChevronDown className="size-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="end"
        sideOffset={4}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <h3 className="font-semibold text-sm">Select a token</h3>
          <button
            onClick={() => setOpen(false)}
            className="rounded-full p-0.5 hover:bg-muted transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Token List */}
        <div className="p-1.5 max-h-64 overflow-y-auto">
          {/* Native Token Section */}
          {nativeToken && (
            <div className="mb-1">
              <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">
                Pay with {nativeToken.symbol}
              </p>
              <TokenRow token={nativeToken} />
            </div>
          )}

          {/* ERC-20 Tokens Section */}
          {erc20Tokens.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground px-2 py-1">
                Pay with other tokens
              </p>
              {erc20Tokens.map((token) => (
                <TokenRow key={token.address} token={token} showGasCost={true} />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
