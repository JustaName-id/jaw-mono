# Example: ENS identity (wagmi · iframe)

wagmi `jaw()` connector with the default embedded iframe. Post-connect action:
resolve and display the connected account's **ENS subname** — the JustaName
identity layer that travels with the user across dApps.

## Run

```bash
bunx nx run-many -t build -p @jaw.id/core @jaw.id/wagmi
VITE_JAW_API_KEY=<your-key> bun --cwd examples/wagmi-ens-identity run dev
```

Env: `VITE_JAW_API_KEY` (required), `VITE_RPC_URL` (optional, defaults to `https://sepolia.base.org`), `VITE_KEYS_URL` (optional).

## What it shows

- Connect, then reverse-resolve the address → ENS subname via the JustaName endpoint.
- Subnames are off-chain, so resolution uses `api.justaname.id` (not a plain on-chain lookup).
- Shows the user's portable identity right after connect.
