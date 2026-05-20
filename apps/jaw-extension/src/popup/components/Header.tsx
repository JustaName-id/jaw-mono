import * as Select from '@radix-ui/react-select';
import type React from 'react';
import { useMemo, useState } from 'react';
import { getChainMeta, listChains, toHexChainId } from '../lib/chains.js';
import { sendRpc } from '../lib/rpc.js';

interface HeaderProps {
  connected: boolean;
  chainIdHex: string | null;
  port: chrome.runtime.Port | null;
  showTestnets: boolean;
  onLock: () => void;
  onOpenSettings: () => void;
}

export function Header({
  connected,
  chainIdHex,
  port,
  showTestnets,
  onLock,
  onOpenSettings,
}: HeaderProps): React.JSX.Element {
  const active = getChainMeta(chainIdHex);
  const chains = useMemo(() => listChains({ includeTestnets: showTestnets }), [showTestnets]);
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSwitch = async (idStr: string): Promise<void> => {
    if (!port) return;
    const targetId = Number(idStr);
    if (!Number.isFinite(targetId) || targetId === active?.id) return;
    setSwitching(targetId);
    setError(null);
    try {
      // EIP-3326: wallet_switchEthereumChain. JAW SDK emits `chainChanged`
      // when the switch succeeds — App.tsx listens for it and updates state.
      await sendRpc(port, 'wallet_switchEthereumChain', [{ chainId: toHexChainId(targetId) }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <header style={styles.root}>
      <div style={styles.bar}>
        <div style={styles.left}>
          <span style={{ ...styles.dot, background: connected ? '#22c55e' : '#9ca3af' }} aria-hidden />
          <strong style={styles.brand}>JAW</strong>
        </div>

        <Select.Root
          value={active ? String(active.id) : undefined}
          onValueChange={handleSwitch}
          disabled={!connected || switching !== null}
        >
          <Select.Trigger style={styles.trigger} aria-label="Select chain">
            <Select.Value placeholder={connected ? 'Select chain' : '—'}>
              {active ? (
                <span style={styles.triggerLabel}>
                  {active.shortName}
                  {active.isTestnet && <span style={styles.testnetBadge}>test</span>}
                </span>
              ) : null}
            </Select.Value>
            <Select.Icon style={styles.triggerIcon}>▾</Select.Icon>
          </Select.Trigger>

          <Select.Portal>
            <Select.Content position="popper" sideOffset={6} style={styles.content}>
              <Select.ScrollUpButton style={styles.scrollBtn}>▲</Select.ScrollUpButton>
              <Select.Viewport style={styles.viewport}>
                {chains.map((chain) => (
                  <Select.Item key={chain.id} value={String(chain.id)} style={styles.item}>
                    <Select.ItemText>{chain.name}</Select.ItemText>
                    {chain.isTestnet && <span style={styles.testnetBadgeMuted}>test</span>}
                  </Select.Item>
                ))}
              </Select.Viewport>
              <Select.ScrollDownButton style={styles.scrollBtn}>▼</Select.ScrollDownButton>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <button type="button" onClick={onOpenSettings} style={styles.lockBtn} aria-label="Settings" title="Settings">
          ⚙
        </button>
        <button
          type="button"
          onClick={onLock}
          style={styles.lockBtn}
          aria-label="Lock / disconnect"
          title="Disconnect"
          disabled={!connected}
        >
          ⏻
        </button>
      </div>

      {error && (
        <div role="alert" style={styles.error}>
          {error}
        </div>
      )}
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(128,128,128,0.18)',
  },
  bar: { display: 'flex', alignItems: 'center', gap: 8 },
  left: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  brand: { fontSize: 14, fontWeight: 600, letterSpacing: 0.3 },
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    minWidth: 96,
    justifyContent: 'space-between',
  },
  triggerLabel: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  triggerIcon: { fontSize: 10, opacity: 0.6 },
  content: {
    minWidth: 180,
    // Cap to the available popup height that Radix measures. Chrome extension
    // popups are bounded (~600px tall); without this the Content overflows
    // past the popup window and the user can't scroll to bottom entries.
    maxHeight: 'var(--radix-select-content-available-height, 280px)',
    background: 'var(--jaw-popup-bg, #fff)',
    color: 'inherit',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 8,
    padding: 4,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    zIndex: 1,
    overflow: 'hidden',
  },
  viewport: {
    maxHeight: 'inherit',
    overflowY: 'auto',
    padding: 2,
  },
  scrollBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 18,
    fontSize: 10,
    color: 'inherit',
    cursor: 'default',
    opacity: 0.6,
    background: 'var(--jaw-popup-bg, #fff)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    fontSize: 13,
    cursor: 'pointer',
    outline: 'none',
    borderRadius: 4,
  },
  testnetBadge: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 4,
    background: '#f59e0b',
    color: '#000',
    fontWeight: 600,
  },
  testnetBadgeMuted: {
    fontSize: 9,
    padding: '1px 5px',
    borderRadius: 4,
    background: 'rgba(245,158,11,0.18)',
    color: '#f59e0b',
    fontWeight: 600,
  },
  lockBtn: {
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
    fontSize: 12,
  },
  error: {
    // In-flow inside the column header — pushes AccountCard down instead
    // of overlapping it (audit M4).
    marginTop: 6,
    padding: '6px 8px',
    fontSize: 11,
    color: '#ef4444',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 6,
  },
};
