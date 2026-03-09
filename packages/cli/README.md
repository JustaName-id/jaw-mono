# @jaw.id/cli

CLI + MCP Server for JAW.id smart accounts -- built for humans and AI agents.

Uses browser-based passkey authentication via keys.jaw.id -- no private key management needed. Exposes a single generic `jaw_rpc` MCP tool that supports all EIP-1193 wallet methods.

## Installation

```bash
# Run directly with npx
npx @jaw.id/cli <command>

# Install globally
npm install -g @jaw.id/cli
```

## Quick Start

```bash
# 1. Configure API key and default chain
jaw config init --api-key YOUR_API_KEY --chain 8453

# 2. Connect your wallet (opens browser for passkey auth)
jaw rpc call wallet_connect

# 3. Send a transaction (opens browser for signing)
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x...","value":"0x0"}]}'

# 4. Check transaction status
jaw rpc call wallet_getCallsStatus '{"id":"0xBatchId"}'
```

## How It Works

When you call an RPC method that requires signing, the CLI:

1. Starts a local HTTP server on `127.0.0.1`
2. Opens your browser to `keys.jaw.id/cli-bridge`
3. You authenticate with your passkey in the browser
4. The result is sent back to the CLI via localhost callback
5. CLI returns the result

Read-only methods (like `eth_accounts`, `wallet_getAssets`) are handled directly without opening a browser.

## CLI Commands

### `jaw rpc call <method> [params]`

Execute any JAW.id RPC method.

```bash
# Connect wallet
jaw rpc call wallet_connect

# Send transaction
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x...","value":"0x0","data":"0x..."}]}'

# Sign a message
jaw rpc call personal_sign '"Hello World"'

# Sign typed data (EIP-712)
jaw rpc call eth_signTypedData_v4 '["0xYOUR_ADDRESS", "{\"types\":{\"EIP712Domain\":[{\"name\":\"name\",\"type\":\"string\"}],\"Person\":[{\"name\":\"name\",\"type\":\"string\"}]},\"primaryType\":\"Person\",\"domain\":{\"name\":\"Test\"},\"message\":{\"name\":\"Alice\"}}"]'

# Grant permissions
jaw rpc call wallet_grantPermissions '{"expiry":1750000000,"spender":"0x...","permissions":{"calls":[{"target":"0x3232323232323232323232323232323232323232","selector":"0xe0e0e0e0"}],"spends":[{"token":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","allowance":"0x2386F26FC10000","unit":"day","multiplier":1}]}}'

# Get assets
jaw rpc call wallet_getAssets

# Get chain ID
jaw rpc call eth_chainId
```

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output` | Output format: `json` or `human` | `human` |
| `-c, --chain` | Chain ID | config default |
| `--api-key` | JAW API key | config/env |
| `-t, --timeout` | Browser callback timeout (seconds) | `120` |
| `-y, --yes` | Skip confirmations | `false` |
| `-q, --quiet` | Suppress non-essential output | `false` |

### `jaw config init`

Initialize CLI configuration.

```bash
jaw config init --api-key YOUR_KEY --chain 8453
```

### `jaw config show`

Display current configuration (API key redacted).

```bash
jaw config show
jaw config show --output json
```

### `jaw config set <key> <value>`

Set a configuration value.

```bash
jaw config set apiKey your-api-key
jaw config set defaultChain 8453
jaw config set keysUrl https://keys.jaw.id
jaw config set paymasterUrl https://paymaster.example.com
```

## Supported RPC Methods

| Method | Category | Browser Required |
|--------|----------|-----------------|
| `eth_requestAccounts` | Session | Yes |
| `wallet_connect` | Session | Yes |
| `wallet_disconnect` | Local | No |
| `wallet_switchEthereumChain` | Local | No |
| `wallet_sendCalls` | Signing | Yes |
| `eth_sendTransaction` | Signing | Yes |
| `personal_sign` | Signing | Yes |
| `eth_signTypedData_v4` | Signing | Yes |
| `wallet_sign` | Signing | Yes |
| `wallet_grantPermissions` | Signing | Yes |
| `wallet_revokePermissions` | Signing | Yes |
| `eth_accounts` | Read-only | No |
| `eth_chainId` | Read-only | No |
| `net_version` | Read-only | No |
| `wallet_getCallsStatus` | Read-only | No |
| `wallet_getCallsHistory` | Read-only | No |
| `wallet_getAssets` | Read-only | No |
| `wallet_getCapabilities` | Read-only | No |
| `wallet_getPermissions` | Read-only | No |

## Testing Guide

Full end-to-end testing sequence:

```bash
# 0. Setup
jaw config init --api-key YOUR_API_KEY --chain 1

# 1. Connect wallet (opens browser)
jaw rpc call wallet_connect

# 2. Verify connection (local, no browser)
jaw rpc call eth_accounts
jaw rpc call eth_chainId
jaw rpc call net_version

# 3. Read-only API calls (no browser, direct API)
jaw rpc call wallet_getAssets
jaw rpc call wallet_getCapabilities
jaw rpc call wallet_getPermissions
jaw rpc call wallet_getCallsHistory

# 4. Sign a message (opens browser)
jaw rpc call personal_sign '"Hello from JAW CLI"'

# 5. Sign typed data (opens browser)
jaw rpc call eth_signTypedData_v4 '["0xYOUR_ADDRESS", "{\"types\":{\"EIP712Domain\":[{\"name\":\"name\",\"type\":\"string\"}],\"Person\":[{\"name\":\"name\",\"type\":\"string\"}]},\"primaryType\":\"Person\",\"domain\":{\"name\":\"Test\"},\"message\":{\"name\":\"Alice\"}}"]'

# 6. Send transaction (opens browser)
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x0000000000000000000000000000000000000000","value":"0x0","data":"0x"}]}'

# 7. Switch chain (local, no browser)
jaw rpc call wallet_switchEthereumChain '[{"chainId":"0x2105"}]'
jaw rpc call eth_chainId  # verify: should return 0x2105

# 8. Grant permissions (opens browser)
jaw rpc call wallet_grantPermissions '{"expiry":1750000000,"spender":"0x0000000000000000000000000000000000000001","permissions":{"calls":[{"target":"0x3232323232323232323232323232323232323232","selector":"0xe0e0e0e0"}],"spends":[{"token":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","allowance":"0x2386F26FC10000","unit":"day","multiplier":1}]}}'

# 9. Verify permissions (no browser)
jaw rpc call wallet_getPermissions

# 10. Revoke permissions (opens browser, use permissionId from step 9)
jaw rpc call wallet_revokePermissions '{"id":"0xPERMISSION_ID_FROM_STEP_9"}'

# 11. Disconnect (local)
jaw rpc call wallet_disconnect
jaw rpc call eth_accounts  # should return []
```

## MCP Server (for AI Agents)

Start the MCP server:

```bash
jaw mcp
```

### MCP Configuration

**Claude Code** (`~/.claude.json`):

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

### MCP Tools

| Tool | Description |
|------|-------------|
| `jaw_rpc` | Execute any JAW.id wallet RPC method. Supports all EIP-1193 methods. Opens browser for passkey signing when needed. |
| `jaw_config_show` | Show current CLI configuration (API key redacted). |
| `jaw_config_set` | Set a CLI configuration value. |

### Example Agent Usage

```
Agent: jaw_rpc({ method: "wallet_sendCalls", params: { calls: [{ to: "0x...", value: "0x0" }] } })
  -> CLI opens browser -> user signs with passkey -> result returned to agent
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JAW_API_KEY` | JAW API key |
| `JAW_CHAIN_ID` | Default chain ID |
| `JAW_OUTPUT` | Output format (`json` or `human`) |

## Configuration

Config file: `~/.jaw/config.json`

```json
{
  "apiKey": "your-api-key",
  "defaultChain": 8453,
  "keysUrl": "https://keys.jaw.id",
  "paymasterUrl": "https://paymaster.example.com"
}
```

## Architecture

```
AI Agent / User
       |
       v
  jaw_rpc({ method, params })
       |
       v
  CLI classifies method
       |
  +----+----+----+
  |         |    |
  v         v    v
Read-only  Local  Signing/Session
(API)     (disk)  (browser)
  |         |    |
  v         v    v
Direct    Update  CLICommunicator
fetch     config  1. Start HTTP server on 127.0.0.1
to API    /session 2. Open browser -> keys.jaw.id/cli-bridge
           |      3. Bridge opens popup (standard flow)
           v      4. User signs with passkey
         Return   5. Bridge POSTs result to localhost
         result   6. CLI returns result
```
