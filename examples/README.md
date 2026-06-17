# JAW examples

Small, self-contained React + TypeScript apps, each showing a **different
integration** and a **post-connect action**. They are standalone (not part of the
Nx graph) but live in the workspace, so `@jaw.id/*` resolve via `workspace:*`.

| Example                                                            | Integration                                | Transport                 | Post-connect action                           |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------- | --------------------------------------------- |
| [`wagmi-sign-message`](./wagmi-sign-message)                       | wagmi connector                            | embedded iframe (default) | `personal_sign` a message                     |
| [`wagmi-siwe-popup`](./wagmi-siwe-popup)                           | wagmi connector                            | **popup**                 | Sign-In with Ethereum (EIP-4361)              |
| [`core-popup-capabilities`](./core-popup-capabilities)             | core SDK, **no wagmi** (EIP-1193 directly) | **popup**                 | read `wallet_getCapabilities` (EIP-5792)      |
| [`wagmi-gasless-sendcalls`](./wagmi-gasless-sendcalls)             | wagmi connector + ERC-20 paymaster         | embedded iframe (default) | gasless batched `wallet_sendCalls` (EIP-5792) |
| [`wagmi-grant-permissions-popup`](./wagmi-grant-permissions-popup) | wagmi connector                            | **popup**                 | grant a scoped permission (ERC-7715)          |
| [`wagmi-ens-identity`](./wagmi-ens-identity)                       | wagmi connector                            | embedded iframe (default) | resolve the account's ENS subname             |

## Running any example

```bash
# 1. Build the SDK packages once (the examples consume the built dist).
bunx nx run-many -t build -p @jaw.id/core @jaw.id/wagmi

# 2. Run an example (Vite dev server). Provide your API key.
VITE_JAW_API_KEY=<your-key> bun --cwd examples/<name> run dev
```

Optional env: `VITE_KEYS_URL` to point at a local keys app (e.g. `http://localhost:3001`).

Each example's README documents what it demonstrates.
