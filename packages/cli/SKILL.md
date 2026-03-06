# @jaw.id/cli — AI Agent Skill

## Trigger

Use this skill when the user or AI agent needs to:
- Interact with a JAW.id smart account (send transactions, sign messages, manage permissions)
- Query wallet state (balances, assets, transaction status, capabilities)
- Connect or disconnect a passkey-authenticated wallet
- Configure CLI settings (API key, chain, keys URL)

## Overview

`@jaw.id/cli` is a CLI + MCP server for JAW.id smart accounts. It exposes a single generic `jaw_rpc` MCP tool that supports all EIP-1193 wallet methods. Signing operations open the browser for passkey authentication via keys.jaw.id — no private keys needed.

## Setup

### MCP Configuration (Claude Code)

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "jaw": {
      "command": "npx",
      "args": ["@jaw.id/cli", "mcp"],
      "env": {
        "JAW_API_KEY": "your-api-key"
      }
    }
  }
}
```

### First-Time Setup

```bash
jaw config init --api-key YOUR_API_KEY --chain 8453
jaw rpc call wallet_connect
```

## MCP Tools

### `jaw_rpc` — Execute any EIP-1193 RPC method

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `method` | string | Yes | EIP-1193 RPC method name |
| `params` | any | No | Method parameters (varies by method) |
| `chainId` | number | No | Target chain ID (overrides default) |

**Supported Methods:**

| Method | Category | Browser Required |
|--------|----------|-----------------|
| `wallet_connect` | Session | Yes |
| `eth_requestAccounts` | Session | Yes |
| `wallet_disconnect` | Local | No |
| `wallet_switchEthereumChain` | Session | Yes |
| `wallet_sendCalls` | Signing | Yes |
| `eth_sendTransaction` | Signing | Yes |
| `personal_sign` | Signing | Yes |
| `eth_signTypedData_v4` | Signing | Yes |
| `wallet_sign` | Signing | Yes |
| `wallet_grantPermissions` | Signing | Yes |
| `wallet_revokePermissions` | Signing | Yes |
| `eth_accounts` | Read-only | No |
| `eth_chainId` | Read-only | No |
| `wallet_getCallsStatus` | Read-only | No |
| `wallet_getCallsHistory` | Read-only | No |
| `wallet_getAssets` | Read-only | No |
| `wallet_getCapabilities` | Read-only | No |
| `wallet_getPermissions` | Read-only | No |

### `jaw_config_show` — Show current configuration

Returns current CLI config with API key redacted.

### `jaw_config_set` — Set a configuration value

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `key` | enum | Yes | One of: `apiKey`, `defaultChain`, `keysUrl`, `paymasterUrl` |
| `value` | string | Yes | Value to set |

## Common Workflows

### Send a Transaction
```
jaw_rpc({ method: "wallet_sendCalls", params: { calls: [{ to: "0xRecipient", value: "0x0", data: "0x..." }] } })
```

### Sign a Message
```
jaw_rpc({ method: "personal_sign", params: "Hello World" })
```

### Sign Typed Data (EIP-712)
```
jaw_rpc({ method: "eth_signTypedData_v4", params: { domain: {...}, types: {...}, primaryType: "...", message: {...} } })
```

### Grant Permissions
```
jaw_rpc({ method: "wallet_grantPermissions", params: { expiry: 1700000000, spender: "0x...", calls: [...] } })
```

### Check Transaction Status
```
jaw_rpc({ method: "wallet_getCallsStatus", params: { id: "0xBatchId" } })
```

### Get Wallet Assets
```
jaw_rpc({ method: "wallet_getAssets" })
```

## CLI Commands

```bash
jaw rpc call <method> [params_json]
jaw config init --api-key KEY --chain CHAIN_ID
jaw config show
jaw config set <key> <value>
jaw mcp
```

## Flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--output` | `-o` | Output format: `json` or `human` | `human` |
| `--chain` | `-c` | Chain ID override | config default |
| `--api-key` | | JAW API key | config/env |
| `--timeout` | `-t` | Browser callback timeout (seconds) | `120` |
| `--yes` | `-y` | Skip confirmations | `false` |
| `--quiet` | `-q` | Suppress non-essential output | `false` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JAW_API_KEY` | JAW API key |
| `JAW_CHAIN_ID` | Default chain ID |
| `JAW_OUTPUT` | Output format (`json` or `human`) |

## How It Works

When a signing method is called:
1. CLI starts a local HTTP server on `127.0.0.1`
2. Opens browser to `keys.jaw.id/cli-bridge`
3. User authenticates with passkey in browser
4. Result is POSTed back to CLI via localhost callback
5. CLI returns the result

Read-only methods are handled directly without opening a browser. After `wallet_connect`, the session is cached locally so `eth_accounts` returns your address without re-authenticating.

## Reference

Full API reference: https://docs.jaw.id/api-reference
