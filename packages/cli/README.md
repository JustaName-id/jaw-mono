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
jaw rpc call eth_signTypedData_v4 '{"domain":{...},"types":{...},"primaryType":"...","message":{...}}'

# Grant permissions
jaw rpc call wallet_grantPermissions '{"expiry":1700000000,"spender":"0x...","calls":[...]}'

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
| `wallet_disconnect` | Session | Yes |
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

Full reference: https://docs.jaw.id/api-reference

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
  → CLI opens browser → user signs with passkey → result returned to agent
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
  +----+----+
  |         |
  v         v
Read-only   Signing
(direct)    (browser)
  |         |
  v         v
Return    CLICommunicator
result    1. Start HTTP server on 127.0.0.1
          2. Open browser → keys.jaw.id/cli-bridge
          3. Bridge opens popup (standard flow)
          4. User signs with passkey
          5. Bridge POSTs result to localhost
          6. CLI returns result
```
