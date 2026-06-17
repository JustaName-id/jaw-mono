# E2E (real browser)

A minimal real-browser check for the embedded iframe transport — covers what
jsdom/unit tests cannot (real CSS compositing and the browser's iframe
`color-scheme` canvas behavior). Runs on **chromium, firefox, and webkit**
(webkit ≈ Safari).

It is intentionally **not** part of `nx test`: it needs the two dev servers
running. It does **not** drive the passkey/connect flow, so it is deterministic,
cross-engine, and needs **no API key** — only the prewarmed, load-time iframe
state. (The passkey ceremonies need a virtual authenticator that only Chromium
exposes, so they are covered by Chromium-only tests + manual QA on real Safari.)

## Run

1. Start the keys app:

   ```bash
   bunx nx dev @jaw-mono/keys-jaw-id --port=3001
   ```

2. Start the playground pointing at the local keys app:

   ```bash
   NEXT_PUBLIC_KEYS_URL=http://localhost:3001 bunx nx dev @jaw-mono/playground --port=3002
   ```

3. Run the E2E (defaults to chromium):

   ```bash
   node e2e/iframe-transport.e2e.mjs
   # or pick an engine:
   JAW_E2E_BROWSER=firefox node e2e/iframe-transport.e2e.mjs
   JAW_E2E_BROWSER=webkit  node e2e/iframe-transport.e2e.mjs
   ```

   Install the engines once with `bunx playwright install chromium firefox webkit`.

Exits `0` on pass, `1` on failure or unmet prerequisites.

## CI

`.github/workflows/e2e.yml` builds the SDK packages (the playground consumes the
built dist, not source), starts both dev servers, and runs this check across
chromium/firefox/webkit. Triggers on PRs touching the transport, the keys app,
the playground, or `e2e/`, and via manual `workflow_dispatch`.

## What it asserts

Scenario: **OS in dark mode, playground forced to light.**

The assertions are **engine-aware**, because the clickjacking guard (AC-4) only
lets an _untrusted_ host embed the iframe on browsers that can verify visibility
via **IntersectionObserver v2 — which is Chromium-only**:

**On Chromium** (IOv2 available → untrusted hosts may embed):

1. The embedded iframe is the **default** transport (mounted on load, pointed at the keys app).
2. The iframe element keeps **`color-scheme: normal`** so the browser does not paint an opaque canvas — the host dApp stays visible (see-through regression guard).
3. The iframe runs in **embedded mode** (`jaw-embedded`).
4. **Theme sync**: the embedded dialog follows the dApp's light mode (no `.dark`), not the OS.
5. The embedded document body is **transparent**.

**On Firefox / WebKit** (no IOv2 → untrusted hosts must NOT embed):

1. The SDK does **not** prewarm-mount the iframe for an untrusted host — it falls back to the popup (security gate, AC-4).

> **Implication:** the see-through embedded iframe is available to every host on
> Chromium, but only to **trusted (allow-listed) partners** on Firefox/Safari;
> everyone else gets the popup. See `packages/core/src/trusted-hosts.ts`.

## Manual QA (real Safari — not coverable headlessly)

Playwright's `webkit` ≈ Safari but isn't identical, and the passkey ceremonies
need a virtual authenticator that only Chromium exposes. Verify on a real Mac +
Safari:

- **Passkey creation** falls back to a popup (Safari blocks `create()` in a cross-origin iframe).
- **Trusted-host iframe** renders see-through (dApp visible around the card) — requires the host to be on the trusted list.
- **Portability**: connect on dApp-A, then on dApp-B (different origin) → Import → **same account address**.

## Overrides

- `JAW_E2E_KEYS_URL` (default `http://localhost:3001`)
- `JAW_E2E_PLAYGROUND_URL` (default `http://localhost:3002`)
