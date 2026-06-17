# Example: Sign a message (wagmi · iframe)

The canonical integration: the **wagmi** `jaw()` connector with the **default
embedded-iframe** transport. Post-connect action: **sign a personal message**
(EIP-191) and show the signature.

## Run

```bash
# from the repo root: build the SDK once, then run the example
bunx nx run-many -t build -p @jaw.id/core @jaw.id/wagmi
VITE_JAW_API_KEY=<your-key> bun --cwd examples/wagmi-sign-message dev
```

Env:

- `VITE_JAW_API_KEY` — your JAW API key
- `VITE_KEYS_URL` — optional, point at a local keys app (e.g. `http://localhost:3001`)

## What it shows

- Connect via the wagmi connector.
- The embedded keys dialog (see-through) handles the passkey.
- `useSignMessage` triggers a `personal_sign`; the signature is displayed.
