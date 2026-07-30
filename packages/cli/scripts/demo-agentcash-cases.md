# Demo: the two AgentCash cases, on JAW

Maps the two AgentCash learn pages to concrete `jaw` commands, run against a local
paid API. The pitch: same developer experience they describe — but the agent holds a
scoped **permission**, not a funded wallet.

- `learn/pay-per-call-apis` → an agent pays each endpoint per call, price read from the 402.
- `learn/payments-for-ai-agents` → spend caps per session/task, on-chain accounting, receipts.

## Terminal 1 — the paid API (the endpoint you must pay for)

```bash
node packages/cli/scripts/demo-x402-server.mjs
# demo x402 API on http://localhost:8402
# paid: /email-lookup (0.01 USDC), /enrich (0.05 USDC), /premium-search (0.25 USDC)
# free: /health
```

This is a real x402 server: it quotes a price in the 402, checks the payment proof, and
returns a receipt — the same wire the CLI speaks. (It verifies proof shape, not on-chain
settlement, so the client flow demos without a facilitator.)

## Terminal 2 — the agent

### Case 1 — pay-per-call ("the penny for an email lookup")

```
# free endpoint: passes straight through, no payment
jaw_pay_and_fetch { "url": "http://localhost:8402/health" }
→ { "paid": false, "status": 200, "body": { "ok": true } }

# paid endpoint: reads the 0.01 USDC price from the 402 and clears it — no human
jaw_pay_and_fetch { "url": "http://localhost:8402/email-lookup?addr=0xd8dA...6045" }
→ {
    "paid": true,
    "payment": { "amount": "10000", "payTo": "0x3C44...93BC", "txHash": "0x35f5...61f4" },
    "topUp": { "amount": "2000000", "batchId": "0x…" },   // refilled from YOUR account, capped on-chain
    "body": { "address": "0xd8dA...6045", "email": "agent@example.com", "verified": true }
  }

# a pricier call — same flow, float already covers it (no on-chain hop)
jaw_pay_and_fetch { "url": "http://localhost:8402/enrich?addr=0xd8dA...6045" }
→ { "paid": true, "payment": { "amount": "50000" }, "body": { "ens": "vitalik.eth", ... } }
```

### Case 2 — spend caps, accounting, receipts

```
# the human sets the budget once (CLI only — the agent can never raise it)
$ jaw config set x402.maxAmountPerPayment 100000     # 0.10 USDC max per call
$ jaw config set x402.maxTotalPerSession 1000000     # 1 USDC max this session

# now the 0.25 USDC premium-search is over the per-call cap → refused BEFORE any spend
jaw_pay_and_fetch { "url": "http://localhost:8402/premium-search?q=agents" }
→ { "paid": false, "status": 402,
    "refusedReason": "amount 250000 exceeds maxAmountPerPayment 100000" }

# every call — paid, refused, or refilled — is on the audit ledger with receipts
jaw_x402_log { "limit": 5 }
→ [ { "url": ".../email-lookup", "status": "paid", "amount": "10000",
      "topUpAmount": "2000000", "topUpBatchId": "0x…", "txHash": "0x35f5…61f4" }, ... ]
```

## The one line that sells it

AgentCash: *"the agent's runtime holds a funded wallet and signs payments directly."*

JAW: the agent holds a **permission**, not a wallet. Funds stay in the user's account;
each call refills only what the on-chain cap allows, and the user revokes in one
transaction. Same `install → fund → go`, without handing over the keys.

## Note on running the paid path fully

The top-up needs an active session (`jaw session setup`, passkey approval, and a
permission that whitelists the USDC transfer — see `smoke-topup-demo.md`). Without a
session, the same commands run against a pre-funded payer (pull mode), which is enough
to show cases 1 and 2 end to end; the top-up is the part that removes the manual
funding.
