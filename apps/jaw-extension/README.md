# @jaw-mono/extension

Chrome MV3 extension that announces JAW as an EIP-6963 wallet provider on every dApp, so RainbowKit / Web3Modal / wagmi see it without any integration on the dApp side.

## Table of contents

- [Architecture](#architecture)
- [Threat model](#threat-model-v1)
- [Develop](#develop)
- [Load in Chrome](#load-in-chrome)
- [End-to-end testing](#end-to-end-testing)
- [Popup widget](#popup-widget)
- [Settings & storage](#settings--storage)
- [Build modes (dev / staging / prod)](#build-modes-dev--staging--prod)
- [Package for distribution](#package-for-distribution)
- [Protocol coverage & audit](#protocol-coverage--audit)
- [Contributing — file map](#contributing--file-map)
- [Notes & known caveats](#notes--known-caveats)

## Architecture

```
dApp page
 ├─ inpage.ts (MAIN world, injected via WAR <script type="module">)
 │     EIP-1193 provider + EIP-6963 announce via mipd
 │           ↕ CustomEvent (per-tab secret event name + nonce)
 └─ content.ts (ISOLATED world)
      bridges CustomEvents ↔ chrome.runtime port
            ↕ chrome.runtime.connect (long-lived port)
    background.ts (service worker)
      • injects inpage via chrome.scripting.executeScript (CSP-bypass via WAR)
      • routes RPC tab ↔ offscreen
      • opens keys.jaw.id popup via chrome.windows.create
      • bridges popup ↔ offscreen postMessage
            ↕ chrome.runtime.connect
    offscreen.ts (hidden DOM context)
      • patches window.open to delegate to background
      • runs JAW.create() unchanged
      • Communicator's postMessage flows through the bridge
            ↕ chrome.runtime + chrome.tabs.sendMessage
    keys.jaw.id popup tab (real browser window)
      ├─ keys-bridge-main.ts (MAIN, document_start)
      │     synthetic window.opener — signs replies via CustomEvent
      └─ keys-bridge-isolated.ts (ISOLATED)
            bridges CustomEvents ↔ chrome.runtime
      passkey ceremony in the unmodified keys.jaw.id app, signs.
```

The SDK lives in an offscreen document — a hidden DOM context with `localStorage` and a real DOM. We do **not** rely on `window.open` from offscreen (Chrome blocks it without user gesture). Instead, the offscreen patches `window.open` to delegate to the background, which uses `chrome.windows.create({ type: 'popup' })`. A pair of content scripts on keys.jaw.id installs a synthetic `window.opener` so the unmodified PopupCommunicator on the keys side just works.

## Threat model (V1)

- **Provider event spoofing by malicious dApp:** the inpage↔content channel uses a per-tab `CustomEvent` with a secret name + nonce delivered via the inpage script's URL hash. Page-world scripts can read the hash from the script tag's `src`, so a determined attacker on the page can spoof provider events (`accountsChanged`, `chainChanged`, etc.) → causes UX confusion / phishing reconnect prompts but **cannot exfiltrate funds**: real signing requests still go through the keys.jaw.id popup which the user explicitly approves.
- **Bridge origin enforcement:** the background validates `sender.origin` against the build-time `JAW_KEYS_URL` for every `jaw-bridge-from-window` message. A compromised page on `api.justaname.id` cannot forge keys.jaw.id popup responses.
- **API key:** baked into the production bundle. Anyone who installs the extension can extract it. This is consistent with how MetaMask et al. distribute Infura keys.

## Develop

```bash
# From the monorepo root
bun install

# Set your API key (each environment has its own)
export JAW_EXTENSION_API_KEY=<your-key>

# Optional: point at a local keys.jaw.id
export JAW_KEYS_URL=http://localhost:3001

# Build the extension (output in apps/jaw-extension/dist)
bunx nx build @jaw-mono/extension

# Or watch mode
bunx nx dev @jaw-mono/extension
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `apps/jaw-extension/dist`

After loading, visit any dApp using EIP-6963 wallet discovery (Uniswap, the local `apps/playground`, etc.) — JAW appears in the wallet picker.

To inspect runtime behavior, open both extension consoles from `chrome://extensions`:

- **service worker** — background script logs (port lifecycle, bridge forwarding, errors)
- **Inspect views: offscreen.html** — JAW SDK + window.open shim logs

When you rebuild while developing, click the **reload** button on the JAW (dev) card. The popup auto-picks up new HTML/JS on next open; content scripts re-inject on next page load.

## End-to-end testing

After loading the extension, run through this checklist to confirm everything works.

### 1. Sign-message (no funds needed)

| Site                            | Method exercised                          |
| ------------------------------- | ----------------------------------------- |
| [login.xyz](https://login.xyz/) | `personal_sign` via Sign-In With Ethereum |
| Any RainbowKit dApp's "Sign In" | `personal_sign`                           |

Steps:

1. Click Connect → pick **JAW** in the picker.
2. Verify the **keys.jaw.id popup shows the real dApp origin** (e.g. `login.xyz`) — not `chrome-extension://...`.
3. Complete the passkey ceremony → page receives your address.
4. Trigger Sign → second passkey ceremony → page receives a 132-char `0x…` signature.
5. Optional: paste the signature into [etherscan.io/verifiedSignatures](https://etherscan.io/verifiedSignatures) → expect `Address matches signature`.

### 2. Transaction (Sepolia, funds needed)

Build the extension in **dev mode** so testnets are visible:

```bash
bunx nx dev @jaw-mono/extension
```

Get Sepolia ETH from any faucet ([Alchemy](https://www.alchemy.com/faucets/ethereum-sepolia), [Google](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)) — you'll need your JAW account address (visible in the popup after a first connect).

Suggested test path:

- [app.uniswap.org/swap?chain=sepolia](https://app.uniswap.org/swap?chain=sepolia)
- Sell: 0.001 ETH → Buy: USDC (paste `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` to import the testnet USDC)
- The first swap triggers a smart-account deployment + Permit2 signature + bundled swap — two passkey ceremonies total.

### 3. Popup widget

Click the JAW icon in the toolbar after connecting:

- Connection dot turns green
- Chain dropdown shows the active chain; switching it fires `wallet_switchEthereumChain` and the dApp updates
- Account card shows truncated address + copy + explorer link + native balance on the active chain
- **Disconnect** clears state without opening any popup (we translate the wagmi `wallet_revokePermissions(eth_accounts)` intent to `wallet_disconnect`)
- **⚙ Settings** opens the settings panel

## Popup widget

UI lives in `src/popup/`. Built with React + `@radix-ui/react-select` for accessibility. Styles are inline `React.CSSProperties` (no CSS-in-JS dependency).

```
src/popup/
├── App.tsx                       # orchestrator + port lifecycle + view switching
├── index.html                    # 360x≥360 widget; CSS var --jaw-popup-bg for dark mode
├── main.tsx                      # React entry
├── lib/
│   ├── chains.ts                 # viem-sourced chain metadata catalog
│   ├── rpc.ts                    # promise wrapper over chrome.runtime.Port
│   └── format.ts                 # truncateAddress, formatBalanceFromHex
└── components/
    ├── Header.tsx                # connection dot + chain Select + ⚙ + ⏻
    ├── AccountCard.tsx           # address + copy + explorer + balance
    ├── ActionRow.tsx             # Disconnect / Refresh / Manage
    └── Settings.tsx              # settings view (testnet toggle, default chain)
```

The popup speaks to the offscreen SDK by sending `rpc-request` envelopes over the long-lived `PORT_NAME_POPUP` port. The background routes them to the offscreen and pipes responses back. See `src/popup/lib/rpc.ts` for the dispatcher.

## Settings & storage

User-controlled settings are stored in `chrome.storage.local` under the key `jaw.settings`. Schema:

```ts
interface Settings {
  schemaVersion: 1;
  showTestnets: boolean | null; // null = use build-time default
  defaultChainId: number | null; // null = use SDK default (1)
}
```

The shared module `src/shared/settings.ts` exposes `getSettings()`, `setSettings(partial)`, `subscribeSettings(handler)`. Use it from popup and background; **do not import it from the offscreen** (see below).

### Why offscreen reads settings via URL params

`chrome.storage` is **not exposed to offscreen documents** in most Chrome versions (a long-standing platform limitation — offscreens only get `chrome.runtime` + `chrome.offscreen`). The workaround:

1. Background SW (which DOES have storage) reads `jaw.settings`.
2. SW builds the offscreen URL with the settings as query params:
   `src/offscreen/offscreen.html?showTestnets=true&defaultChainId=11155111`
3. SW calls `chrome.offscreen.createDocument({ url })`.
4. The offscreen parses `window.location.search` at boot and passes the result to `JAW.create()`.

When the user changes a setting and clicks **Save & reload**, `chrome.runtime.reload()` restarts the extension. The SW re-reads storage, builds a fresh URL, recreates the offscreen with the new params. This is the only way to apply settings that affect the SDK because `JAW.create()` is one-shot — its options are frozen after construction.

## Build modes (dev / staging / prod)

The Vite build behaves differently based on the `--mode` flag:

| Mode               | Build command                             | Testnets visible?                                          | API key required?                         |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| **dev**            | `bunx nx dev @jaw-mono/extension` (watch) | Yes — `import.meta.env.MODE === 'development'`             | No (placeholder if unset)                 |
| **prod** (default) | `bunx nx build @jaw-mono/extension`       | No (mainnet only by default; user can opt in via Settings) | Yes when `CI=true` — see `vite.config.ts` |

Two env vars matter:

| Env var                 | Effect                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `JAW_EXTENSION_API_KEY` | Compiled into the bundle via Vite `define` as `__JAW_EXTENSION_API_KEY__`. Required for the SDK to talk to JAW's relay.  |
| `JAW_KEYS_URL`          | Override the keys.jaw.id URL (default `https://keys.jaw.id`). Useful for staging or local dev (`http://localhost:3001`). |

The production-build API-key guard fires only in CI (`vite.config.ts` checks `process.env.CI === 'true' && mode === 'production'`). This lets local prod-mode builds and the pre-push hook run with an empty placeholder; only the release pipeline strictly enforces the key.

## Package for distribution

```bash
bunx nx package @jaw-mono/extension
# Produces apps/jaw-extension/jaw-extension.zip
```

## Protocol coverage & audit

A full per-EIP audit lives in [`AUDIT.md`](./AUDIT.md). Highlights:

- **EIP-1193** — provider methods routed transparently to the SDK; cached reads (`eth_accounts`, `eth_chainId`) updated via events.
- **EIP-6963** — announce + re-announce on `eip6963:requestProvider`. Inpage stays a tiny self-contained bundle so injection is fast on every page.
- **EIP-2255** — `wallet_revokePermissions([{ eth_accounts: {} }])` is translated to `wallet_disconnect` at the inpage layer so wagmi-style disconnects don't open a popup.
- **EIP-3326** — `wallet_switchEthereumChain` works from both dApp calls and the popup chain dropdown.
- **EIP-5792** — `wallet_sendCalls` / `wallet_getCapabilities` / `wallet_getCallsStatus` forwarded as-is to the SDK.
- **EIP-1474** error envelopes — viem's `shortMessage`, `details`, `metaMessages`, and `cause` are preserved under `data` so dApp error UIs stay useful.

One known caveat (`AUDIT.md` item #4): the offscreen's `currentRpcId` could race under simultaneous cross-tab signing. Mitigations documented; a serialize-signing-class fix is planned for Phase 4.

## Contributing — file map

Where to look when extending the extension:

| You want to…                                              | Touch this                                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change what `window.ethereum` exposes / EIP-6963 metadata | `src/inpage/inpage.ts`                                                                                                                                                                                            |
| Add / change a per-tab message kind                       | `src/shared/messages.ts` (typed wire format) + the producer/consumer files                                                                                                                                        |
| Add a popup UI element                                    | `src/popup/components/` + wire from `src/popup/App.tsx`                                                                                                                                                           |
| Add a user-controllable setting                           | `src/shared/settings.ts` (extend `Settings` + `migrate`) + `src/popup/components/Settings.tsx` + read in offscreen via URL params (`src/background/background.ts:ensureOffscreen` + `src/offscreen/offscreen.ts`) |
| Add chain metadata for a new network                      | `src/popup/lib/chains.ts` (extends the catalog; SDK chain support is a separate `packages/core` concern)                                                                                                          |
| Tighten manifest permissions / CSP / WAR                  | `manifest.config.ts`                                                                                                                                                                                              |
| Change how the dApp origin reaches keys.jaw.id            | `src/background/background.ts:resolveDappOriginForRpc` + `isSdkConfigMessage` rewrite                                                                                                                             |

**Do not modify `packages/core` from this branch** — extension work stays in `apps/jaw-extension`. SDK changes are tracked separately.

## Notes & known caveats

- `window.ethereum` is **only** set when nothing else has claimed it — we never override MetaMask or another wallet. EIP-6963 announcement is the canonical discovery path.
- `host_permissions` are limited to `keys.jaw.id` and `api.justaname.id`. We do not need broad host permissions because content scripts use `chrome.runtime.connect`, not direct fetches into dApp origins.
- Service workers in MV3 suspend after ~30s idle. The offscreen document persists state; ports auto-reconnect on next request.
- Inpage caches `eth_accounts` / `eth_chainId` and invalidates on `accountsChanged` / `chainChanged` / `connect` / `disconnect` events so wagmi/viem polling doesn't flood the offscreen.
- Icons: placeholder PNGs live in `public/icons/`. Replace with real assets before publishing.
