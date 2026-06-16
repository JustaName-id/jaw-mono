# E2E (real browser)

Real-Chromium end-to-end checks that jsdom cannot cover: actual passkey
ceremony (via a virtual WebAuthn authenticator) and real CSS rendering.

These are intentionally **not** part of `nx test` — they need both dev servers
running and an API key, so they're opt-in/local (and a follow-up for CI).

## Run

1. Start the keys app:

   ```bash
   bunx nx dev @jaw-mono/keys-jaw-id --port=3001
   ```

2. Start the playground pointing at the local keys app, with an API key:

   ```bash
   NEXT_PUBLIC_API_KEY=<your-key> NEXT_PUBLIC_KEYS_URL=http://localhost:3001 \
     bunx nx dev @jaw-mono/playground --port=3002
   ```

3. Run the E2E:

   ```bash
   node e2e/iframe-transport.e2e.mjs
   ```

Exits `0` on pass, `1` on failure or unmet prerequisites.

## What `iframe-transport.e2e.mjs` verifies

Scenario: **OS in dark mode, playground forced to light** — the case that
originally rendered the embedded dialog dark.

- The playground renders light.
- The SDK mounts the keys iframe (iframe transport is the default) and points
  it at the configured keys app.
- The prewarm handshake delivers the dApp theme and the embedded dialog
  follows the dApp's light mode (no `.dark` class, solid white background) —
  i.e. theme sync works in a real browser, not just jsdom.

## Overrides

- `JAW_E2E_KEYS_URL` (default `http://localhost:3001`)
- `JAW_E2E_PLAYGROUND_URL` (default `http://localhost:3002`)
