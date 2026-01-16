# @jaw.id/wagmi

Wagmi connector and React hooks for JAW (JustaName Account Wallet) smart accounts.

## Installation

```bash
npm install @jaw.id/wagmi wagmi @tanstack/react-query
# or
yarn add @jaw.id/wagmi wagmi @tanstack/react-query
# or
bun add @jaw.id/wagmi wagmi @tanstack/react-query
```

## Quick Start

### 1. Configure Wagmi with JAW Connector

```typescript
import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    jaw({
     apiKey: 'your-api-key',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
```

### 2. Use React Hooks

```tsx
import { useConnect, useDisconnect, useGrantPermissions } from '@jaw.id/wagmi';
import { useAccount } from 'wagmi';

function App() {
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { grantPermissions } = useGrantPermissions();

  if (isConnected) {
    return (
      <div>
        <p>Connected: {address}</p>
        <button onClick={() => disconnect()}>Disconnect</button>
        <button onClick={() => grantPermissions({ permissions: [...] })}>
          Grant Permissions
        </button>
      </div>
    );
  }

  return <button onClick={() => connect()}>Connect</button>;
}
```

## Exports

### Connector

- `jaw(options)` - Wagmi connector factory

```typescript
import { jaw } from '@jaw.id/wagmi';

const connector = jaw({
    apiKey: 'your-api-key',
});
```

### React Hooks

Available as named exports or via the `Hooks` namespace:

```typescript
import { useConnect, Hooks } from '@jaw.id/wagmi';

// Both are equivalent:
useConnect();
Hooks.useConnect();
```

| Hook | Description |
|------|-------------|
| `useConnect` | Connect to JAW wallet |
| `useDisconnect` | Disconnect from wallet |
| `useGrantPermissions` | Grant permissions to apps (EIP-7715) |
| `useRevokePermissions` | Revoke previously granted permissions |
| `usePermissions` | Query current permissions |
| `useGetAssets` | Query wallet assets (EIP-7811) |
| `useCapabilities` | Query wallet capabilities |

### Actions (Non-React)

For use outside React components or with other state managers:

```typescript
import { connect, Actions } from '@jaw.id/wagmi';

// Both are equivalent:
await connect(config, { connector });
await Actions.connect(config, { connector });
```

| Action | Description |
|--------|-------------|
| `connect` | Connect to wallet |
| `disconnect` | Disconnect from wallet |
| `grantPermissions` | Grant permissions |
| `revokePermissions` | Revoke permissions |
| `getPermissions` | Get current permissions |
| `getAssets` | Get wallet assets |
| `getCapabilities` | Get wallet capabilities |

### TanStack Query Utilities

Query key factories for custom query implementations:

```typescript
import { Query, getPermissionsQueryKey } from '@jaw.id/wagmi';

// Use with TanStack Query
const queryKey = getPermissionsQueryKey({ address, chainId });
```

## Peer Dependencies

- `react` >= 18.0.0
- `wagmi` >= 3.0.0
- `@tanstack/react-query` >= 5.0.0

## Documentation

For detailed guides, API reference, and examples, visit **[docs.jaw.id](https://docs.jaw.id)**.

## License

[MIT](../../LICENSE.md)