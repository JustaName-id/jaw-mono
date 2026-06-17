# Example: Grant a scoped permission (wagmi · popup)

wagmi `jaw()` connector with the **popup** transport. Post-connect action: grant
a scoped **ERC-7715** permission — a capped spend per period plus a specific call
the spender may make. This is the building block for **agents / sessions** that
act within a bounded, revocable budget.

## Run

```bash
bunx nx run-many -t build -p @jaw.id/core @jaw.id/wagmi
VITE_JAW_API_KEY=<your-key> bun --cwd examples/wagmi-grant-permissions-popup run dev
```

Env: `VITE_JAW_API_KEY` (required), `VITE_KEYS_URL` (optional).

## What it shows

- `useGrantPermissions({ spender, expiry, permissions })` from `@jaw.id/wagmi`.
- A `spends` limit (1 USDC/day) + a `calls` scope (`transfer(address,uint256)`).
- The keys popup shows the consent screen with the limits; the result is displayed.

> Granting registers the permission on-chain, so the account needs gas (or a
> paymaster). Replace `SPENDER`/`USDC` with your own session key and token.
