# Example: Core SDK, no wagmi (popup)

Integration **without wagmi** — uses the core SDK's EIP-1193 provider directly
(`JAW.create().provider.request(...)`), with the **popup** transport. Post-connect
action: read the smart account's **wallet capabilities** (EIP-5792
`wallet_getCapabilities`) — gasless/paymaster, atomic batching, permissions, per chain.

## Run

```bash
bunx nx run-many -t build -p @jaw.id/core @jaw.id/wagmi
VITE_JAW_API_KEY=<your-key> bun --cwd examples/core-popup-capabilities run dev
```

Env: `VITE_JAW_API_KEY` (required), `VITE_KEYS_URL` (optional, e.g. `http://localhost:3001`).

## What it shows

- No wagmi / React Query — just `JAW.create()` and `provider.request(...)`.
- `eth_requestAccounts` connects (popup); `wallet_getCapabilities` reads what the account supports.
- The same provider also serves `personal_sign`, `wallet_sendCalls`, `wallet_grantPermissions`, etc.
