import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { JAW_KEYS_URL, PORT_NAME_POPUP } from '../shared/constants.js';
import type { AnyMessage } from '../shared/messages.js';
import { newId } from '../shared/messages.js';
import { getSettings, subscribeSettings } from '../shared/settings.js';
import { Header } from './components/Header.js';
import { AccountCard } from './components/AccountCard.js';
import { ActionRow } from './components/ActionRow.js';
import { Settings } from './components/Settings.js';
import { installRpcListener } from './lib/rpc.js';

interface Status {
  connected: boolean;
  accounts: string[];
  chainId: string | null;
}

// Build-time default for the chain dropdown filter. The user's stored
// setting (chrome.storage.local) overrides this at runtime; null means
// "use build default". Vite gotcha: `import.meta.env.DEV` is `false`
// during `vite build` even with --mode development.
const BUILD_SHOW_TESTNETS = import.meta.env.MODE === 'development';

type View = 'main' | 'settings';

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<Status>({ connected: false, accounts: [], chainId: null });
  const [loading, setLoading] = useState(true);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [port, setPort] = useState<chrome.runtime.Port | null>(null);
  const [view, setView] = useState<View>('main');
  const [showTestnets, setShowTestnets] = useState<boolean>(BUILD_SHOW_TESTNETS);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  // Read user-stored testnet preference (overrides build default) and stay
  // in sync if it changes (e.g. user toggles in Settings then we re-render
  // before the reload kicks in).
  useEffect(() => {
    getSettings().then((s) => {
      if (s.showTestnets !== null) setShowTestnets(s.showTestnets);
    });
    return subscribeSettings((next) => {
      setShowTestnets(next.showTestnets ?? BUILD_SHOW_TESTNETS);
    });
  }, []);

  useEffect(() => {
    const p = chrome.runtime.connect({ name: PORT_NAME_POPUP });
    portRef.current = p;
    setPort(p);

    // Shared dispatcher for rpc-response routing (used by Header/AccountCard).
    const detachRpc = installRpcListener(p);

    // Status + provider-event listener. We keep a separate listener instead
    // of routing through the RPC dispatcher because these aren't responses
    // to caller-initiated promises — they're push events.
    const eventHandler = (message: AnyMessage): void => {
      if (message.kind === 'status-response') {
        setStatus({
          connected: message.connected,
          accounts: message.accounts,
          chainId: message.chainId,
        });
        setLoading(false);
        return;
      }
      if (message.kind === 'provider-event') {
        if (message.event === 'accountsChanged') {
          const accounts = Array.isArray(message.payload) ? (message.payload as string[]) : [];
          setStatus((prev) => ({ ...prev, connected: accounts.length > 0, accounts }));
        } else if (message.event === 'chainChanged') {
          setStatus((prev) => ({
            ...prev,
            chainId: typeof message.payload === 'string' ? message.payload : prev.chainId,
          }));
        } else if (message.event === 'disconnect') {
          setStatus({ connected: false, accounts: [], chainId: null });
        }
      }
    };
    p.onMessage.addListener(eventHandler);
    p.postMessage({ kind: 'status-request', id: newId() });

    // Defensive timeout: if the offscreen never replies, stop spinning so
    // the user at least sees the disconnected state.
    const failsafe = window.setTimeout(() => setLoading(false), 3000);

    return () => {
      window.clearTimeout(failsafe);
      p.onMessage.removeListener(eventHandler);
      detachRpc();
      p.disconnect();
      portRef.current = null;
    };
  }, []);

  const openKeys = (path: string): void => {
    chrome.tabs.create({ url: `${JAW_KEYS_URL}${path}` });
  };

  const handleLock = async (): Promise<void> => {
    // Same path as ActionRow's Disconnect; surfacing it on the header lock
    // icon matches MetaMask/Rabby's UX where the lock button drops the
    // active connection.
    if (!port) return;
    try {
      port.postMessage({ kind: 'rpc-request', id: newId(), method: 'wallet_disconnect' });
    } catch {
      /* port may already be closed */
    }
  };

  const address = status.accounts[0];

  if (view === 'settings') {
    return (
      <div style={styles.root}>
        <Settings onBack={() => setView('main')} />
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Header
        connected={status.connected}
        chainIdHex={status.chainId}
        port={port}
        showTestnets={showTestnets}
        onLock={handleLock}
        onOpenSettings={() => setView('settings')}
      />

      {loading ? (
        <div style={styles.loading}>Loading…</div>
      ) : status.connected ? (
        <>
          <AccountCard address={address} chainIdHex={status.chainId} port={port} refreshSeq={refreshSeq} />
          <ActionRow
            connected={status.connected}
            port={port}
            onRefresh={() => setRefreshSeq((n) => n + 1)}
            onManage={() => openKeys('/')}
          />
        </>
      ) : (
        <section style={styles.empty}>
          <p style={styles.emptyTitle}>Not connected</p>
          <p style={styles.emptyBody}>
            Visit a dApp and pick <strong>JAW</strong> from the wallet picker to connect.
          </p>
          <button type="button" onClick={() => openKeys('/')} style={styles.linkBtn}>
            Open keys.jaw.id
          </button>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column' },
  loading: {
    padding: '24px 16px',
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
  },
  empty: { padding: '24px 16px', textAlign: 'center' },
  emptyTitle: { margin: 0, fontSize: 14, fontWeight: 600 },
  emptyBody: { margin: '6px 0 14px', fontSize: 12, opacity: 0.7, lineHeight: 1.5 },
  linkBtn: {
    padding: '8px 14px',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
};
