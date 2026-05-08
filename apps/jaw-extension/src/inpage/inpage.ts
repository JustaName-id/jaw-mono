// Inlined EIP-6963 announce — keeps this bundle a single self-contained file.
// mipd's announceProvider is a thin wrapper around these two events; importing
// any module would force the imported chunk into web_accessible_resources.
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: `data:image/${string}`;
  rdns: string;
}
interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: unknown;
}
function announceEip6963(detail: EIP6963ProviderDetail): void {
  const dispatch = () => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        // Object.freeze prevents listeners from mutating the broadcast detail.
        detail: Object.freeze(detail),
      })
    );
  };
  dispatch();
  // Re-announce whenever a dApp asks (e.g. wagmi watching for new providers).
  window.addEventListener('eip6963:requestProvider', dispatch);
}

// Inlined to keep this bundle self-contained — pages can only load files in
// `web_accessible_resources`, so any import would force exposing the imported
// chunk too. Constants are kept in sync with `packages/core/src/constants.ts`.
const JAW_WALLET_ICON: `data:image/${string}` = `data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzgiIGhlaWdodD0iMzgiIHZpZXdCb3g9IjAgMCAzOCAzOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjM4IiBoZWlnaHQ9IjM4IiByeD0iNCIgZmlsbD0id2hpdGUiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTMsIDApIj4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDIxLjk5NDYgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjkuMzAxNCkiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMjAuODYwMykiIGZpbGw9IiMwMjA2MTciLz4KPHJlY3Qgd2lkdGg9IjcuMzk3MDQiIGhlaWdodD0iNy4zOTcwNCIgdHJhbnNmb3JtPSJtYXRyaXgoLTAuODY2MDI1IDAuNSAwIC0xIDM0Ljc5MDMgMTIuMzk3KSIgZmlsbD0iIzAyMDYxNyIvPgo8cmVjdCB3aWR0aD0iNy4zOTcwNCIgaGVpZ2h0PSI3LjM5NzA0IiB0cmFuc2Zvcm09Im1hdHJpeCgtMC44NjYwMjUgLTAuNSAwIDEgMTUuNjA2IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDI1LjYwMjkpIiBmaWxsPSIjMDIwNjE3Ii8+CjxyZWN0IHdpZHRoPSI3LjM5NzA0IiBoZWlnaHQ9IjcuMzk3MDQiIHRyYW5zZm9ybT0ibWF0cml4KC0wLjg2NjAyNSAtMC41IDAgMSAyOC40MDE0IDE3LjE2MTgpIiBmaWxsPSIjMDIwNjE3Ii8+CjwvZz4KPC9zdmc+`;
const JAW_WALLET_NAME = 'JAW';
const JAW_WALLET_RDNS = 'keys.jaw.id';

// Wire-format types — duplicated locally to keep inpage self-contained.
type ProviderEventName = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged';
interface RpcResponseMsg {
  kind: 'rpc-response';
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
interface ProviderEventMsg {
  kind: 'provider-event';
  event: ProviderEventName;
  payload: unknown;
}
interface RpcRequestMsg {
  kind: 'rpc-request';
  id: string;
  method: string;
  params?: readonly unknown[] | object;
}
type WireMsg = RpcRequestMsg | RpcResponseMsg | ProviderEventMsg;

type Listener = (...args: unknown[]) => void;

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

interface MessageDetail {
  nonce: string;
  payload: WireMsg;
}

const PROVIDER_INFO: EIP6963ProviderInfo = {
  uuid: crypto.randomUUID(),
  name: JAW_WALLET_NAME,
  icon: JAW_WALLET_ICON,
  rdns: JAW_WALLET_RDNS,
};

class JawInpageProvider {
  private listeners: Map<string, Set<Listener>> = new Map();
  private pending: Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number }> =
    new Map();
  private nonce: string;
  private eventName: string;
  // Cache for cheap, frequently-polled methods. Wagmi/viem clients poll
  // eth_accounts and eth_chainId on every render; the bridge is authoritative
  // via events (accountsChanged, chainChanged, connect, disconnect), so we can
  // serve repeat reads synchronously from cache without hitting the offscreen.
  private cachedAccounts: readonly string[] | undefined;
  private cachedChainId: string | undefined;

  readonly isJaw = true;

  constructor(nonce: string, eventName: string) {
    this.nonce = nonce;
    this.eventName = eventName;
    window.addEventListener(eventName, this.onContentEvent as EventListener);
  }

  private onContentEvent = (event: Event): void => {
    const ce = event as CustomEvent<MessageDetail>;
    const detail = ce.detail;
    if (!detail || detail.nonce !== this.nonce || !detail.payload) return;
    const msg = detail.payload;
    if (msg.kind === 'rpc-response') {
      this.resolvePending(msg as RpcResponseMsg);
    } else if (msg.kind === 'provider-event') {
      const ev = msg as ProviderEventMsg;
      this.applyEventToCache(ev.event, ev.payload);
      this.dispatch(ev.event, ev.payload);
    }
  };

  private applyEventToCache(event: ProviderEventName, payload: unknown): void {
    if (event === 'accountsChanged' && Array.isArray(payload)) {
      this.cachedAccounts = payload as string[];
    } else if (event === 'chainChanged' && typeof payload === 'string') {
      this.cachedChainId = payload;
    } else if (event === 'connect' && payload && typeof payload === 'object') {
      const chainId = (payload as { chainId?: unknown }).chainId;
      if (typeof chainId === 'string') this.cachedChainId = chainId;
    } else if (event === 'disconnect') {
      this.cachedAccounts = [];
    }
  }

  private resolvePending(msg: RpcResponseMsg): void {
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.error) {
      const err: Error & { code?: number; data?: unknown } = new Error(msg.error.message);
      err.code = msg.error.code;
      err.data = msg.error.data;
      entry.reject(err);
    } else {
      entry.resolve(msg.result);
    }
  }

  private dispatch(event: ProviderEventName, payload: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error('[JAW] listener error', err);
      }
    }
  }

  request = (args: { method: string; params?: readonly unknown[] | object }): Promise<unknown> => {
    if (!args || typeof args.method !== 'string') {
      return Promise.reject(new Error('Invalid request arguments'));
    }
    if (args.method === 'eth_accounts' && this.cachedAccounts !== undefined) {
      return Promise.resolve([...this.cachedAccounts]);
    }
    if (args.method === 'eth_chainId' && this.cachedChainId !== undefined) {
      return Promise.resolve(this.cachedChainId);
    }
    // EIP-2255: wallet_revokePermissions([{ eth_accounts: {} }]) is the standard
    // "disconnect" intent used by wagmi/injected connectors. The JAW SDK would
    // otherwise route this through CrossPlatformSigner and open the keys.jaw.id
    // popup. Smart accounts have no per-dApp connection state to revoke on-chain
    // for eth_accounts, so we translate it to wallet_disconnect (handled locally
    // by JAWProvider — clears signer + emits disconnect/accountsChanged:[]).
    const isAccountsRevoke =
      args.method === 'wallet_revokePermissions' &&
      Array.isArray(args.params) &&
      args.params.length === 1 &&
      typeof args.params[0] === 'object' &&
      args.params[0] !== null &&
      Object.keys(args.params[0] as Record<string, unknown>).length === 1 &&
      'eth_accounts' in (args.params[0] as Record<string, unknown>);
    const id = crypto.randomUUID();
    const method = isAccountsRevoke ? 'wallet_disconnect' : args.method;
    const params = isAccountsRevoke ? undefined : args.params;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          const err = new Error('Request timed out');
          (err as Error & { code: number }).code = -32603;
          reject(err);
        }
      }, REQUEST_TIMEOUT_MS);
      const wrappedResolve = (v: unknown): void => {
        if (method === 'eth_accounts' && Array.isArray(v)) {
          this.cachedAccounts = v as string[];
        } else if (method === 'eth_chainId' && typeof v === 'string') {
          this.cachedChainId = v;
        }
        resolve(v);
      };
      this.pending.set(id, { resolve: wrappedResolve, reject, timer });
      const detail: MessageDetail = {
        nonce: this.nonce,
        payload: { kind: 'rpc-request', id, method, params },
      };
      window.dispatchEvent(new CustomEvent(this.eventName, { detail }));
    });
  };

  on = (event: string, listener: Listener): this => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  };

  removeListener = (event: string, listener: Listener): this => {
    this.listeners.get(event)?.delete(listener);
    return this;
  };

  off = this.removeListener;

  once = (event: string, listener: Listener): this => {
    const wrap: Listener = (...args) => {
      this.removeListener(event, wrap);
      listener(...args);
    };
    return this.on(event, wrap);
  };

  addListener = this.on;

  removeAllListeners = (event?: string): this => {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
    return this;
  };
}

/**
 * Inpage runs as a `<script type="module" src="...#nonce=X&event=Y">` injected
 * by the background's executeScript bootstrap. WAR resources injected as a
 * `<script>` tag bypass page CSP (the same pattern MetaMask et al. use); the
 * URL hash carries the per-tab nonce and CustomEvent name. Hash values are
 * page-readable from the script tag's `src` (best-effort secret); the real
 * security boundary is the popup/passkey prompt the user explicitly approves
 * for every signing operation.
 */
function readBootstrapArgs(): { nonce: string; eventName: string } | null {
  const url = import.meta.url;
  const hashIdx = url.indexOf('#');
  if (hashIdx < 0) return null;
  const params = new URLSearchParams(url.slice(hashIdx + 1));
  const nonce = params.get('nonce');
  const eventName = params.get('event');
  if (!nonce || !eventName) return null;
  return { nonce, eventName };
}

const args = readBootstrapArgs();
if (args) {
  const provider = new JawInpageProvider(args.nonce, args.eventName);

  announceEip6963({ info: PROVIDER_INFO, provider });

  const w = window as unknown as { ethereum?: unknown };
  if (typeof w.ethereum === 'undefined') {
    Object.defineProperty(w, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
    });
  }
} else {
  console.error('[JAW] inpage missing bootstrap args');
}
