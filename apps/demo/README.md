# JAW Demo

The guided product tour at [demo.jaw.id](https://demo.jaw.id). Four mock consumer apps in a
phone frame — every CTA opens the **real** keys.jaw.id dialog and sends a **real** request on
Base Sepolia (84532).

## The tour

| #   | Screen            | Request                                                                           | Adversarial variant                                                    |
| --- | ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Sign in / Sign up | `wallet_connect` + SIWE                                                           | message claims `evil.com` → keys flags the domain mismatch as phishing |
| 2   | Send (Splitos)    | `wallet_sendCalls` — 2 × 0.1 USDC transfer, atomic                                | —                                                                      |
| 3   | Swap (Exchange)   | `wallet_sendCalls` — approve + Uniswap v3 `exactInputSingle`, atomic              | unlimited approval instead of the exact amount                         |
| 4   | Agent delegation  | `wallet_grantPermissions` (ERC-7715) — 25 USDC/day, 0.01 ETH/month, 30-day expiry | wildcard target + selector, i.e. the whole account                     |

Each screen pushes its own `JawTheme`, so the dialog is painted like the host app. Sign-in
always disconnects first, so onboarding is demoed fresh.

## Run it

From the repo root:

```bash
bun install
cp apps/demo/.env.example apps/demo/.env.local   # fill in NEXT_PUBLIC_API_KEY
bunx nx dev @jaw-mono/demo
```

`NEXT_PUBLIC_API_KEY` ([dashboard.jaw.id](https://dashboard.jaw.id/)) is the only required
var — dev throws without it. Funding stays off unless `TREASURY_PRIVATE_KEY` is set;
analytics stays off unless `NEXT_PUBLIC_ANALYTICS_ENABLED=true`.

The iframe transport needs a secure context: over plain `http://localhost` the SDK falls back
to the popup on its own, so use `next dev --experimental-https` to exercise the real path.
`.env.example` points `NEXT_PUBLIC_KEYS_URL` at a local keys app on `:3000`, leaving the demo
on the next free port.
