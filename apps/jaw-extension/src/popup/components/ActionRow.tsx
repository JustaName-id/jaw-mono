import type React from 'react';
import { useState } from 'react';
import { sendRpc } from '../lib/rpc.js';

interface ActionRowProps {
  connected: boolean;
  port: chrome.runtime.Port | null;
  onRefresh: () => void;
  onManage: () => void;
}

export function ActionRow({ connected, port, onRefresh, onManage }: ActionRowProps): React.JSX.Element {
  const [disconnecting, setDisconnecting] = useState(false);

  const disconnect = async (): Promise<void> => {
    if (!port || disconnecting) return;
    setDisconnecting(true);
    try {
      // wallet_disconnect is handled entirely inside JAWProvider — no popup,
      // no on-chain effect. The `disconnect` + `accountsChanged:[]` events
      // fire as a side-effect; App.tsx receives them and resets UI state.
      await sendRpc(port, 'wallet_disconnect');
    } catch {
      /* ignore — even if the call errors, UI state will reset when the
         provider event arrives or on next status-request */
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={styles.row}>
      <button
        type="button"
        onClick={disconnect}
        disabled={!connected || disconnecting}
        style={{ ...styles.btn, ...styles.danger, opacity: connected && !disconnecting ? 1 : 0.4 }}
      >
        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={!connected}
        style={{ ...styles.btn, opacity: connected ? 1 : 0.4 }}
      >
        Refresh
      </button>
      <button type="button" onClick={onManage} style={styles.btn}>
        Manage
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 6,
    margin: '12px 16px',
  },
  btn: {
    padding: '8px 10px',
    border: '1px solid rgba(128,128,128,0.3)',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 12,
  },
  danger: {
    borderColor: 'rgba(239,68,68,0.4)',
    color: '#ef4444',
  },
};
