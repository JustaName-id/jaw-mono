# E2E (real browser)

A minimal real-Chromium check for the embedded iframe transport — covers what
jsdom/unit tests cannot (real CSS compositing and the browser's iframe
`color-scheme` canvas behavior).

It is intentionally **not** part of `nx test`: it needs the two dev servers
running. It does **not** drive the passkey/connect flow, so it is deterministic
and needs **no API key** — only the prewarmed, load-time iframe state.

## Run

1. Start the keys app:

   ```bash
   bunx nx dev @jaw-mono/keys-jaw-id --port=3001
   ```

2. Start the playground pointing at the local keys app:

   ```bash
   NEXT_PUBLIC_KEYS_URL=http://localhost:3001 bunx nx dev @jaw-mono/playground --port=3002
   ```

3. Run the E2E:

   ```bash
   node e2e/iframe-transport.e2e.mjs
   ```

Exits `0` on pass, `1` on failure or unmet prerequisites.

## What it asserts

Scenario: **OS in dark mode, playground forced to light.**

1. The embedded iframe is the **default** transport (mounted on load, pointed at the keys app).
2. The iframe element keeps **`color-scheme: normal`** so the browser does not paint an opaque canvas — the host dApp stays visible (see-through regression guard).
3. The iframe runs in **embedded mode** (`jaw-embedded`).
4. **Theme sync**: the embedded dialog follows the dApp's light mode (no `.dark`), not the OS.
5. The embedded document body is **transparent**.

## Overrides

- `JAW_E2E_KEYS_URL` (default `http://localhost:3001`)
- `JAW_E2E_PLAYGROUND_URL` (default `http://localhost:3002`)
