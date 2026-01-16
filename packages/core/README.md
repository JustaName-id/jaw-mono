# @jaw.id/core

Core SDK for JAW (JustaName Account Wallet) - an EIP-1193 compliant provider for smart account operations with passkey authentication.

## Installation

```bash
npm install @jaw.id/core
# or
yarn add @jaw.id/core
# or
bun add @jaw.id/core
```

## Quick Start

```typescript
import { JAW } from '@jaw.id/core';

// Create a JAW instance
const jaw = await JAW.create({
  appName: 'My App',
  apiKey: 'your-api-key',
});

// Connect to get an account
const account = await jaw.provider.request({ method: 'eth_requestAccounts' });

// Send transactions, sign messages, etc.
const txHash = await jaw.provider.request({
  method: 'wallet_sendCalls',
  params: [{ calls: [{ to: '0x...', value: '0x0', data: '0x' }] }],
});
```

## Features

- **EIP-1193 Provider** - Standard Ethereum provider interface compatible with any dApp
- **Smart Accounts** - Full smart account support with batched transactions
- **Passkey Authentication** - Secure, passwordless authentication using WebAuthn
- **Permission Management** - Grant and revoke granular permissions (EIP-7715)
- **Asset Queries** - Query wallet assets across chains (EIP-7811)
- **Two Authentication Modes**:
  - **CrossPlatform** (default) - Portable credentials via popup to keys.jaw.id
  - **AppSpecific** - Embedded passkeys with custom UI

## Authentication Modes

### CrossPlatform Mode (Default)

Opens a popup window to keys.jaw.id for passkey operations. Credentials are portable across applications.

```typescript
const jaw = await JAW.create({
  apiKey: 'your-api-key',
});
```

### AppSpecific Mode

Passkeys are stored per-application. Requires implementing the `UIHandler` interface for custom UI.

```typescript
import { JAW, type UIHandler } from '@jaw.id/core';

const uiHandler: UIHandler = {
  handleRequest: async (request) => {
    // Handle UI requests (connect, sign, transaction, etc.)
    // Return appropriate response or throw UIError to cancel
  },
};

const jaw = await JAW.create({
  apiKey: 'your-api-key',    
  appName: 'My App',
  mode: 'appSpecific',
  uiHandler,
});
```

## Core Exports

### SDK Creation

- `JAW.create()` / `create()` - Factory function to create SDK instance
- `JAWProvider` - EIP-1193 compliant provider class
- `createJAWProvider()` - Create provider directly

### Account Operations

- `Account` - Smart account class for signing, transactions, and permissions

### Permission Types (EIP-7715)

- `Permission`, `PermissionsDetail`, `SpendPermissionDetail`
- `WalletGrantPermissionsRequest`, `WalletGrantPermissionsResponse`
- `WalletRevokePermissionsRequest`, `WalletGetPermissionsResponse`
- `ANY_TARGET`, `ANY_FN_SEL`, `EMPTY_CALLDATA_FN_SEL` - Permission selector constants

### Asset Types (EIP-7811)

- `Asset`, `AssetMetadata`, `AssetType`, `AssetFilter`
- `WalletGetAssetsParams`, `WalletGetAssetsResponse`

### UI Handler Types (for AppSpecific mode)

- `UIHandler`, `UIHandlerConfig`, `UIRequest`, `UIResponse`
- Request types: `ConnectUIRequest`, `SignatureUIRequest`, `TransactionUIRequest`, `PermissionUIRequest`, etc.
- `UIError`, `UIErrorCode` - Error handling for UI operations

## Dependencies

- [viem](https://viem.sh) - Ethereum interactions and smart account utilities
- [ox](https://github.com/wevm/ox) - Low-level crypto operations
- [zustand](https://zustand-demo.pmnd.rs/) - State management

## Documentation

For detailed guides, API reference, and examples, visit **[docs.jaw.id](https://docs.jaw.id)**.

## License

[MIT](../../LICENSE.md)