import type React from 'react';
import { useEffect, useState } from 'react';
import { getChainMeta } from '../lib/chains.js';
import { sendRpc } from '../lib/rpc.js';
import { formatBalanceFromHex, truncateAddress } from '../lib/format.js';

interface AccountCardProps {
  address: string | undefined;
  chainIdHex: string | null;
  port: chrome.runtime.Port | null;
  refreshSeq: number;
}

export function AccountCard({ address, chainIdHex, port, refreshSeq }: AccountCardProps): React.JSX.Element | null {
  const chain = getChainMeta(chainIdHex);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address || !port) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    setBalanceError(null);
    setBalance(null);
    (async () => {
      try {
        const result = await sendRpc<string>(port, 'eth_getBalance', [address, 'latest']);
        if (!cancelled) setBalance(formatBalanceFromHex(result));
      } catch (err) {
        if (!cancelled) {
          setBalance(null);
          setBalanceError(err instanceof Error ? err.message : 'Failed to load balance');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, chainIdHex, port, refreshSeq]);

  if (!address) return null;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — fall through silently; user can still see the address */
    }
  };

  const openExplorer = (): void => {
    if (!chain?.explorerUrl) return;
    chrome.tabs.create({ url: `${chain.explorerUrl}/address/${address}` });
  };

  return (
    <section style={styles.card}>
      <div style={styles.row}>
        <div style={styles.addrBlock}>
          <span style={styles.label}>Account</span>
          <code style={styles.addr}>{truncateAddress(address)}</code>
        </div>
        <div style={styles.actions}>
          <button type="button" onClick={copy} style={styles.iconBtn} aria-label="Copy address" title="Copy">
            {copied ? '✓' : '⎘'}
          </button>
          <button
            type="button"
            onClick={openExplorer}
            style={styles.iconBtn}
            disabled={!chain?.explorerUrl}
            aria-label="View on explorer"
            title="View on explorer"
          >
            ↗
          </button>
        </div>
      </div>

      <div style={styles.balanceRow}>
        <span style={styles.label}>Balance</span>
        <span style={styles.balance}>
          {balance ?? (balanceError ? '—' : '…')} {chain?.nativeSymbol ?? ''}
        </span>
      </div>

      {balanceError && (
        <p style={styles.errLine} title={balanceError}>
          Couldn't fetch balance
        </p>
      )}
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    margin: '12px 16px',
    padding: 12,
    border: '1px solid rgba(128,128,128,0.18)',
    borderRadius: 10,
    background: 'rgba(128,128,128,0.05)',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  addrBlock: { display: 'flex', flexDirection: 'column', gap: 2 },
  label: { fontSize: 10, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  addr: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 },
  actions: { display: 'flex', gap: 6 },
  iconBtn: {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 13,
  },
  balanceRow: {
    marginTop: 12,
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  balance: { fontSize: 15, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  errLine: { fontSize: 10, color: '#ef4444', margin: '6px 0 0' },
};
