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
jaw config set apiKey=YOUR_API_KEY defaultChain=8453

# 2. Connect your wallet (opens browser for passkey auth)
jaw rpc call wallet_connect

# 3. Send a transaction
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x...","value":"0x0"}]}'

# 4. Check transaction status
jaw rpc call wallet_getCallsStatus '{"id":"0xBatchId"}'

# 5. When done, stop the background daemon
jaw disconnect
```

## How It Works

The CLI uses a persistent background daemon that communicates with the browser via a cloud relay (`wss://relay.jaw.id`). This avoids mixed-content issues — both sides connect outbound over secure WebSockets.

```
CLI ──ws://localhost──▸ Daemon ──wss://relay.jaw.id/{session}──▸ Relay ◂──wss://relay.jaw.id/{session}── Browser (keys.jaw.id)
```

1. CLI spawns a background daemon on `127.0.0.1` (if not already running)
2. Daemon connects outbound to `wss://relay.jaw.id` as the "daemon" peer
3. Daemon opens your browser to `keys.jaw.id/cli-bridge?session={id}`
4. Browser page connects outbound to `wss://relay.jaw.id` as the "browser" peer
5. The relay pairs both peers by session ID and forwards messages bidirectionally
6. CLI sends RPC requests to the daemon (local WebSocket), which forwards them through the relay to the browser SDK
7. Browser SDK executes the request (prompting for passkey signing when needed)
8. Response flows back: browser → relay → daemon → CLI

The daemon stays alive across CLI commands so you only authenticate once. It auto-shuts down after 30 minutes of inactivity, or you can stop it manually with `jaw disconnect`.

### Why a Cloud Relay?

Browser security policies block HTTPS pages from connecting to `ws://localhost` (mixed content). Brave and Safari enforce this strictly. The relay ensures both sides use `wss://` — no certificates, no browser extensions, no workarounds needed.

## CLI Commands

### `jaw rpc call <method> [params]`

Execute any JAW.id RPC method via the browser bridge.

```bash
# Connect wallet
jaw rpc call wallet_connect

# Send transaction
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x...","value":"0x0","data":"0x..."}]}'

# Sign a message
jaw rpc call personal_sign '"Hello World"'

# Sign typed data (EIP-712)
jaw rpc call eth_signTypedData_v4 '["0xYOUR_ADDRESS", "{\"types\":{...},\"primaryType\":\"...\",\"domain\":{...},\"message\":{...}}"]'

# Grant permissions
jaw rpc call wallet_grantPermissions '{"expiry":1750000000,"spender":"0x...","permissions":{...}}'

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
| `-t, --timeout` | Request timeout (seconds) | `120` |
| `-y, --yes` | Skip confirmations | `false` |
| `-q, --quiet` | Suppress non-essential output | `false` |

### `jaw config show`

Display current configuration (API key redacted).

```bash
jaw config show
jaw config show --output json
```

### `jaw config set`

Set one or more configuration values.

```bash
jaw config set apiKey=your-api-key defaultChain=8453
jaw config set ens=yourdomain.eth paymasterUrl=https://paymaster.example.com
jaw config set keysUrl=https://keys.jaw.id

# Legacy syntax also supported
jaw config set apiKey your-api-key
```

### `jaw disconnect`

Stop the background bridge daemon and close the browser session.

```bash
jaw disconnect
```

## Testing Guide

Full end-to-end testing sequence:

```bash
# 0. Setup
jaw config set apiKey=YOUR_API_KEY defaultChain=1

# 1. Connect wallet (opens browser, daemon starts)
jaw rpc call wallet_connect

# 2. Verify connection
jaw rpc call eth_accounts
jaw rpc call eth_chainId
jaw rpc call net_version

# 3. Read-only calls
jaw rpc call wallet_getAssets
jaw rpc call wallet_getCapabilities
jaw rpc call wallet_getPermissions
jaw rpc call wallet_getCallsHistory

# 4. Sign a message
jaw rpc call personal_sign '"Hello from JAW CLI"'

# 5. Sign typed data
jaw rpc call eth_signTypedData_v4 '["0xYOUR_ADDRESS", "{\"types\":{\"EIP712Domain\":[{\"name\":\"name\",\"type\":\"string\"}],\"Person\":[{\"name\":\"name\",\"type\":\"string\"}]},\"primaryType\":\"Person\",\"domain\":{\"name\":\"Test\"},\"message\":{\"name\":\"Alice\"}}"]'

# 6. Send transaction
jaw rpc call wallet_sendCalls '{"calls":[{"to":"0x0000000000000000000000000000000000000000","value":"0x0","data":"0x"}]}'

# 7. Switch chain
jaw rpc call wallet_switchEthereumChain '[{"chainId":"0x2105"}]'
jaw rpc call eth_chainId  # verify: should return 0x2105

# 8. Grant permissions
jaw rpc call wallet_grantPermissions '{"expiry":1750000000,"spender":"0x0000000000000000000000000000000000000001","permissions":{"calls":[{"target":"0x3232323232323232323232323232323232323232","selector":"0xe0e0e0e0"}],"spends":[{"token":"0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE","allowance":"0x2386F26FC10000","unit":"day","multiplier":1}]}}'

# 9. Verify permissions
jaw rpc call wallet_getPermissions

# 10. Revoke permissions (use permissionId from step 9)
jaw rpc call wallet_revokePermissions '{"id":"0xPERMISSION_ID_FROM_STEP_9"}'

# 11. Disconnect
jaw rpc call wallet_disconnect
jaw rpc call eth_accounts  # should return []

# 12. Stop daemon
jaw disconnect
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
  -> Daemon forwards to browser -> user signs with passkey -> result returned to agent
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JAW_API_KEY` | JAW API key |
| `JAW_CHAIN_ID` | Default chain ID |
| `JAW_OUTPUT` | Output format (`json` or `human`) |
| `JAW_RELAY_URL` | Override relay URL (default: `wss://relay.jaw.id`) |

## Configuration

Config file: `~/.jaw/config.json`

```json
{
  "apiKey": "your-api-key",
  "defaultChain": 8453,
  "keysUrl": "https://keys.jaw.id",
  "paymasterUrl": "https://paymaster.example.com",
  "ens": "yourdomain.eth"
}
```

The daemon also writes runtime state to `~/.jaw/`:

| File | Purpose |
|------|---------|
| `config.json` | User configuration (mode 0600) |
| `bridge.json` | Active daemon connection info (port, token, pid, sessionId) |
| `session.json` | Cached session state |
| `daemon.log` | Daemon stdout/stderr for debugging |