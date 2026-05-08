# @jaw-mono/extension

Chrome MV3 extension that announces JAW as an EIP-6963 wallet provider on every dApp, so RainbowKit / Web3Modal / wagmi see it without any integration on the dApp side.

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

## Package for distribution

```bash
bunx nx package @jaw-mono/extension
# Produces apps/jaw-extension/jaw-extension.zip
```

## Icons

Placeholder PNGs live in `public/icons/`. Replace with real assets before publishing.

## Notes

- `window.ethereum` is **only** set when nothing else has claimed it — we never override MetaMask or another wallet. EIP-6963 announcement is the canonical discovery path.
- `host_permissions` are limited to `keys.jaw.id` and `api.justaname.id`. We do not need broad host permissions because content scripts use `chrome.runtime.connect`, not direct fetches into dApp origins.
- Service workers in MV3 suspend after ~30s idle. The offscreen document persists state; ports auto-reconnect on next request.
