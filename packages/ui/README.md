# @jaw.id/ui

React UI components for JAW (JustaName Account Wallet) - pre-built dialogs for wallet interactions.

## Installation

```bash
npm install @jaw.id/ui
```

Import styles in your app entry point:

```typescript
import '@jaw.id/ui/style.css';
```

## Quick Start

Use `ReactUIHandler` with app-specific passkey mode:

```tsx
import { JAW } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';
import '@jaw.id/ui/style.css';

const uiHandler = new ReactUIHandler({
  container: document.getElementById('jaw-ui-root')!,
});

const jaw = await JAW.create({
  apiKey: 'your-api-key',
  appName: 'My App',
  mode: 'appSpecific',
  uiHandler,
});
```

## Exports

**Dialog Components:** `OnboardingDialog`, `ConnectDialog`, `TransactionDialog`, `SignatureDialog`, `Eip712Dialog`, `SiweDialog`, `PermissionDialog`, `DefaultDialog`

**React Integration:** `ReactUIHandler` - Complete UIHandler implementation for app-specific mode

## Peer Dependencies

- `react` >= 18.0.0
- `react-dom` >= 18.0.0

## Documentation

For detailed guides and examples, visit **[docs.jaw.id](https://docs.jaw.id)**.

## License

[MIT](../../LICENSE.md)