import { useEffect, useRef, useState } from 'react';
import { JAW_KEYS_URL, PORT_NAME_POPUP } from '../shared/constants.js';
import type { AnyMessage } from '../shared/messages.js';
import { newId } from '../shared/messages.js';

interface Status {
  connected: boolean;
  accounts: string[];
  chainId: string | null;
}

export function App() {
  const [status, setStatus] = useState<Status>({ connected: false, accounts: [], chainId: null });
  const [loading, setLoading] = useState(true);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: PORT_NAME_POPUP });
    portRef.current = port;

    port.onMessage.addListener((message: AnyMessage) => {
      if (message.kind === 'status-response') {
        setStatus({
          connected: message.connected,
          accounts: message.accounts,
          chainId: message.chainId,
        });
        setLoading(false);
      } else if (message.kind === 'provider-event') {
        if (message.event === 'accountsChanged') {
          const accounts = Array.isArray(message.payload) ? (message.payload as string[]) : [];
          setStatus((prev) => ({ ...prev, connected: accounts.length > 0, accounts }));
        } else if (message.event === 'chainChanged') {
          setStatus((prev) => ({ ...prev, chainId: typeof message.payload === 'string' ? message.payload : null }));
        } else if (message.event === 'disconnect') {
          setStatus({ connected: false, accounts: [], chainId: null });
        }
      }
    });

    port.postMessage({ kind: 'status-request', id: newId() });

    // Defensive timeout: if the offscreen never replies, stop spinning so the
    // user at least sees the disconnected state instead of a permanent loader.
    const failsafe = window.setTimeout(() => setLoading(false), 3000);

    return () => {
      window.clearTimeout(failsafe);
      port.disconnect();
      portRef.current = null;
    };
  }, []);

  const open = (path: string): void => {
    chrome.tabs.create({ url: `${JAW_KEYS_URL}${path}` });
  };

  return (
    <div style={{ padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <strong style={{ fontSize: 18 }}>JAW</strong>
        <span style={{ fontSize: 11, opacity: 0.6 }}>Smart account wallet</span>
      </header>

      {loading ? (
        <p style={{ opacity: 0.6, fontSize: 13 }}>Loading…</p>
      ) : status.connected ? (
        <section>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.6 }}>Connected as</p>
          <p style={{ margin: '4px 0 12px', fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-all' }}>
            {status.accounts[0]}
          </p>
          {status.chainId !== null && (
            <p style={{ margin: 0, fontSize: 13 }}>
              <span style={{ opacity: 0.6 }}>Chain: </span>
              {parseInt(status.chainId, 16)}
            </p>
          )}
        </section>
      ) : (
        <section>
          <p style={{ fontSize: 13, marginTop: 0 }}>Not connected.</p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Visit a dApp and pick <strong>JAW</strong> from the wallet list.
          </p>
        </section>
      )}

      <footer style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => open('/')}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid currentColor',
            background: 'transparent',
            borderRadius: 6,
            color: 'inherit',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Manage account
        </button>
      </footer>
    </div>
  );
}
