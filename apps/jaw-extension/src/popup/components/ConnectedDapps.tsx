import type React from 'react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_PERMISSIONS,
  getPermissions,
  subscribePermissions,
  type PermissionsState,
} from '../../shared/permissions.js';
import { checkOrigin } from '../../shared/phishing.js';

interface DappEntry {
  origin: string;
  accounts: string[];
  grantedAt: number;
  lastSeenAt: number;
}

export function ConnectedDapps(): React.JSX.Element | null {
  const [state, setState] = useState<PermissionsState>(DEFAULT_PERMISSIONS);
  // Origins the user has revoked during this popup session. We render based
  // on storage (`state.origins`) UNION-MINUS this set, so a click on ✕ stays
  // hidden even if a stale `subscribePermissions` echo briefly re-introduces
  // the entry. The set lives only for the popup's lifetime; once the user
  // closes and reopens the popup, storage is the source of truth.
  const [hiddenOrigins, setHiddenOrigins] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    getPermissions().then(setState);
    return subscribePermissions((next, prev) => {
      setState(next);
      // Clear the "hidden" flag ONLY on an actual transition from
      // not-granted (missing or tombstoned in prev) to freshly granted in
      // next. A stale onChanged echo where prev and next both show the
      // origin as granted is NOT a reconnect — without this check, those
      // echoes would silently un-hide a row the user just dismissed.
      setHiddenOrigins((cur) => {
        if (cur.size === 0) return cur;
        let changed = false;
        const out = new Set(cur);
        for (const origin of cur) {
          const prevEntry = prev.origins[origin];
          const nextEntry = next.origins[origin];
          const wasGranted = !!prevEntry && prevEntry.accounts.length > 0 && typeof prevEntry.revokedAt !== 'number';
          const isNowGranted = !!nextEntry && nextEntry.accounts.length > 0 && typeof nextEntry.revokedAt !== 'number';
          if (!wasGranted && isNowGranted) {
            out.delete(origin);
            changed = true;
          }
        }
        return changed ? out : cur;
      });
    });
  }, []);

  const entries: DappEntry[] = Object.entries(state.origins)
    // Tombstones (accounts: [], revokedAt set) live in storage during the
    // cooldown window to defeat autoConnect re-grants. They must NOT appear
    // in the connected-dApps list — they're not connected.
    .filter(([origin, p]) => p.accounts.length > 0 && !hiddenOrigins.has(origin))
    .map(([origin, p]) => ({ origin, accounts: p.accounts, grantedAt: p.grantedAt, lastSeenAt: p.lastSeenAt }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  if (entries.length === 0) {
    return (
      <section style={styles.card}>
        <header style={styles.header}>
          <span style={styles.title}>Connected dApps</span>
          <span style={styles.count}>0</span>
        </header>
        <p style={styles.empty}>No dApps are connected. Connect from any dApp to see it here.</p>
      </section>
    );
  }

  return (
    <section style={styles.card}>
      <header style={styles.header}>
        <span style={styles.title}>Connected dApps</span>
        <span style={styles.count}>{entries.length}</span>
      </header>
      <ul style={styles.list}>
        {entries.map((e) => (
          <DappRow
            key={e.origin}
            origin={e.origin}
            accounts={e.accounts}
            lastSeenAt={e.lastSeenAt}
            onLocalRevoke={(o) =>
              // Mark this origin hidden for the lifetime of this popup. The
              // render filter uses both this set AND storage state, so even
              // if a stale chrome.storage.onChanged echo briefly reports
              // the origin as still permitted, the row stays gone.
              setHiddenOrigins((prev) => {
                const next = new Set(prev);
                next.add(o);
                return next;
              })
            }
          />
        ))}
      </ul>
    </section>
  );
}

interface DappRowProps {
  origin: string;
  accounts: string[];
  lastSeenAt: number;
  onLocalRevoke: (origin: string) => void;
}

function DappRow({ origin, accounts, lastSeenAt, onLocalRevoke }: DappRowProps): React.JSX.Element {
  const verdict = checkOrigin(origin);
  return (
    <li style={verdict.suspicious ? styles.rowDanger : styles.row}>
      <div style={styles.rowInfo}>
        <span style={styles.origin} title={origin}>
          {verdict.suspicious && <span style={styles.warnIcon}>⚠</span>}
          {shorten(origin)}
        </span>
        <span style={verdict.suspicious ? styles.metaWarn : styles.meta}>
          {verdict.suspicious
            ? (verdict.reason ?? 'Suspicious origin')
            : `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${relativeTime(lastSeenAt)}`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          onLocalRevoke(origin);
          // Route the revoke through the SW (not a direct storage write
          // from the popup). The SW serializes all permission writes in
          // ONE queue, so revoke can't race against concurrent grant flows.
          chrome.runtime.sendMessage({ kind: 'jaw-revoke-origin', origin }).catch((err) => {
            console.error('[JAW popup] revoke message failed', err);
          });
        }}
        style={styles.removeBtn}
        aria-label={`Disconnect ${origin}`}
        title="Disconnect this dApp"
      >
        ✕
      </button>
    </li>
  );
}

function shorten(origin: string): string {
  try {
    const u = new URL(origin);
    return u.host;
  } catch {
    return origin;
  }
}

function relativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    margin: '12px 16px',
    padding: 12,
    border: '1px solid rgba(128,128,128,0.18)',
    borderRadius: 10,
    background: 'rgba(128,128,128,0.05)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 },
  count: { fontSize: 11, opacity: 0.6, fontVariantNumeric: 'tabular-nums' },
  empty: { fontSize: 12, opacity: 0.6, margin: 0, lineHeight: 1.5 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 0',
  },
  rowDanger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '8px 8px',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 6,
    margin: '2px 0',
  },
  warnIcon: { marginRight: 6, color: '#ef4444' },
  metaWarn: { fontSize: 10, color: '#ef4444' },
  rowInfo: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 },
  origin: {
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: { fontSize: 10, opacity: 0.6 },
  removeBtn: {
    width: 24,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 6,
    background: 'transparent',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: 11,
  },
};
