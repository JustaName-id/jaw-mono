# Demo: x402 permission top-up (flow 2b) — Base Sepolia

Untracked local runbook for the live demo. Branch: `feat/x402-permission-topup`.

## One-time setup

```bash
# 1. Build the CLI from the branch
cd packages/cli && yarn build

# 2. Config: API key + Base Sepolia as default
jaw config set apiKey <API_KEY>
jaw config set defaultChain 84532

# 3. The permission the agent will use MUST allow a USDC transfer to the payer
#    AND carry a USDC spend allowance. Put this in ~/.jaw/config.json under
#    "permissions" (or pass via --permissions), replacing <USDC> with the
#    Base Sepolia USDC address 0x036CbD53842c5426634e7929541eC2318f3dCF7e:
#
#    "permissions": {
#      "calls":  [{ "target": "<USDC>", "selector": "0xa9059cbb" }],   // transfer(address,uint256)
#      "spends": [{ "token": "<USDC>", "allowance": "0x989680", "unit": "day" }]  // 10 USDC/day
#    }
#
#    Without the transfer call whitelisted, every top-up reverts on-chain.

# 4. Create the session + grant that permission (browser opens, passkey approval).
jaw session setup --chain 84532

# 5. Fund the USER's account (ownerAddress from the setup output) with Base
#    Sepolia USDC (circle faucet) — NOT the session payer EOA. That's the point:
#    the payer starts empty.

# 6. Optional: float target so one top-up covers several payments (2 USDC)
#    (edit ~/.jaw/config.json -> x402.topUpFloat: "2000000")
```

## The demo

```bash
# Payer EOA starts at 0 — show it:
#   jaw_x402_balance (MCP) or check on basescan.

# Hit a paid endpoint (our staging ENS x402 endpoint, or any x402 server on
# base-sepolia). Through MCP: jaw_pay_and_fetch { url: <paid-url> }
```

Expected sequence, visible in the result + on basescan:

1. 402 challenge received, policy approves the requirement.
2. **Top-up**: `wallet_sendCalls` from the session smart account →
   `JustaPermissionManager` transfers USDC user → payer EOA (gasless, paymaster).
3. EIP-3009 payment signed by the payer EOA, facilitator settles, resource returns.
4. Second call: **no top-up** (float covers it) — pure speed.
5. Exhaust the cap (raise maxAmount / loop calls): top-up **refused on-chain**,
   result says "spending cap reached", user's funds untouched.
6. `jaw session revoke` → next call degrades to a clean refusal.

## Talking points

- The payer EOA never holds more than the float; the user's wallet and keys
  never change (invariants in the gist architecture doc).
- Same DX as AgentCash's balance — but the "balance" is the permission.
- No contract changes, no facilitator changes: everything rides what's deployed.
