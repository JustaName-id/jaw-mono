'use client';

import { useEffect, useState } from 'react';

export type SwapQuote = {
  /** USDC amount being sold, e.g. "0.20" */
  sell: string;
  /** WETH received at the live rate */
  receive: string;
  /** "1 ETH = 3,086 USDC" */
  rate: string;
  /** Fiat value of the sold amount */
  usd: string;
  /** Fiat value of 1 WETH, e.g. "$3,086.00" */
  rateUsd: string;
  live: boolean;
};

// Design-file rate used until (or if) the live fetch lands.
const FALLBACK_ETH_USD = 3086;

/**
 * Live ETH price for the swap screen's quote (USDC treated as $1).
 * Uniswap's quote API needs a server-side key, so this uses a public,
 * CORS-friendly price feed instead — the point is real numbers on screen.
 */
export function useEthQuote(usdcAmount: number): SwapQuote {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const json = (await res.json()) as { ethereum?: { usd?: number } };
        const usd = json.ethereum?.usd;
        if (!cancelled && typeof usd === 'number' && usd > 0) setPrice(usd);
      } catch {
        // keep fallback/previous price
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const ethUsd = price ?? FALLBACK_ETH_USD;
  const receive = usdcAmount / ethUsd;
  const fmt = (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString('en-US', opts);
  return {
    sell: usdcAmount.toFixed(2),
    receive: receive.toFixed(6),
    rate: `1 WETH = ${fmt(ethUsd, { maximumFractionDigits: 0 })} USDC`,
    usd: `$${usdcAmount.toFixed(2)}`,
    rateUsd: `$${fmt(ethUsd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    live: price !== null,
  };
}
