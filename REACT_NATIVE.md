# JAW React Native Implementation - Complete Documentation

## Overview

This document provides comprehensive documentation for the JAW React Native implementation, covering the `@jaw/ui-native` package, its integration with `@jaw.id/core`, and the `@playground/demo-native` demo application.

**Key Achievement**: Successfully implemented a production-ready React Native SDK with dual authentication modes:
- **Cross-Platform Mode**: Browser-based authentication via Safari View Controller / Chrome Custom Tab
- **App-Specific Mode**: Native passkey support with Face ID / Touch ID

---

## Table of Contents

1. [Package Structure](#package-structure)
2. [Authentication Modes](#authentication-modes)
3. [Core SDK Modifications](#core-sdk-modifications)
4. [UI-Native Package Architecture](#ui-native-package-architecture)
5. [Demo-Native Playground](#demo-native-playground)
6. [Configuration Requirements](#configuration-requirements)
7. [Testing Instructions](#testing-instructions)

---

## 1. Package Structure

### Published Packages

#### `@jaw/ui-native` (`packages/ui-native/`)
React Native UI library providing:
- Base UI components (Button, Card, Input, Modal, etc.)
- Domain modals (Onboarding, Signature, Transaction, Permission)
- Two authentication providers (JAWNativeProvider, UIHandlerProvider)
- Passkey adapters for react-native-passkey integration
- Cross-platform browser authenticator

#### `@jaw.id/core` (Modified)
Core SDK enhanced with React Native support:
- Optional `getFn`/`createFn` parameters in Account methods
- Support for native passkey adapters
- Platform-agnostic credential management

#### `@playground/demo-native` (`playground/demo-native/`)
Full-featured Expo demo application showcasing both authentication modes

---

## 2. Authentication Modes

### Mode 1: Cross-Platform (Browser-Based)

**Use Case**: Portable credentials across apps, works in Expo Go

**Implementation**:
```typescript
import { JAWNativeProvider, useJAWNative } from '@jaw/ui-native';

// Wrap your app
<JAWNativeProvider
  apiKey="your-api-key"
  appName="Your App Name"
  defaultChainId={11155111}
  keysUrl="https://keys.jaw.id"
>
  <YourApp />
</JAWNativeProvider>

// Use in components
const { connect, disconnect, signMessage, sendTransaction } = useJAWNative();
```

**How It Works**:
1. Opens Safari View Controller (iOS) / Chrome Custom Tab (Android)
2. User authenticates on keys.jaw.id with WebAuthn
3. Browser deep links back to app with result
4. App updates connection state

**Advantages**:
- Works in Expo Go (no development build needed)
- Credentials work across all apps
- Full browser WebAuthn support
- No AASA/assetlinks.json configuration needed

### Mode 2: App-Specific (Native Passkeys)

**Use Case**: Native Face ID/Touch ID, app-specific credentials

**Implementation**:
```typescript
import { UIHandlerProvider, ModalRenderer, ReactNativeUIHandler } from '@jaw/ui-native';
import { Account } from '@jaw.id/core';

// Create handler and wrap app
const uiHandler = new ReactNativeUIHandler();

<UIHandlerProvider handler={uiHandler}>
  <ModalRenderer />
  <YourApp />
</UIHandlerProvider>

// Use in components with Account class
import { createNativePasskeyCredential, getCredentialAdapter } from '@jaw/ui-native';

const account = await Account.create(
  { chainId: 11155111, apiKey: 'your-api-key' },
  {
    username: 'user.jaw',
    rpId: 'your-domain.com',
    rpName: 'Your App',
    nativeCreateFn: createNativePasskeyCredential,
    getFn: getCredentialAdapter
  }
);
```

**How It Works**:
1. Account operations trigger UIHandler requests
2. UIHandlerProvider shows appropriate modal
3. Modal wrapper handles business logic
4. Passkey adapter bridges to react-native-passkey
5. Modal resolves with user approval/rejection

**Advantages**:
- Native biometric authentication
- Better UX with modal overlays
- More control over UI/UX
- Works offline after initial setup

**Requirements**:
- Development build (not Expo Go)
- AASA file (iOS) / assetlinks.json (Android)
- iOS 15+ / Android API 28+

---

## 3. Core SDK Modifications

### Changes to `packages/core/src/account/Account.ts`

#### Added Type Definitions
```typescript
export interface CreateAccountOptions {
  username: string;
  rpId?: string;
  rpName?: string;
  createFn?: PasskeyCreateFn;      // NEW: React Native adapter
  nativeCreateFn?: NativePasskeyCreateFn;  // NEW: Direct RN creation
}

export interface GetAccountOptions {
  getFn?: PasskeyGetFn;             // NEW: React Native adapter
}

export interface ImportAccountOptions {
  getFn?: PasskeyGetFn;             // NEW: React Native adapter
  rpId?: string;
}
```

#### Modified Methods

**Account.create()** - Now accepts `createFn` and `nativeCreateFn`:
```typescript
static async create(config: AccountConfig, options: CreateAccountOptions): Promise<Account>
```

**Account.get()** - Now accepts `getFn` for signing:
```typescript
static async get(config: AccountConfig, credentialId?: string, options?: GetAccountOptions): Promise<Account>
```

**Account.import()** - Now accepts `getFn` for cloud backup import:
```typescript
static async import(config: AccountConfig, options?: ImportAccountOptions): Promise<Account>
```

**Account.getStoredAccounts()** - NEW static method:
```typescript
static async getStoredAccounts(apiKey: string): Promise<PasskeyAccount[]>
```

### Changes to `packages/core/src/passkey-manager/`

#### PasskeyManager.ts
- Added optional `createFn` parameter to `createPasskey()`
- Added optional `getFn` parameter to `authenticateWithWebAuthn()`
- Added optional `getFn` parameter to `importPasskeyAccount()`

#### utils.ts
- Exported `PasskeyCreateFn` type
- Exported `PasskeyGetFn` type
- Exported `NativePasskeyCreateFn` type

### Why These Changes?

React Native doesn't have full `crypto.subtle` support (uses react-native-quick-crypto polyfill). The adapters:
1. Convert viem's WebAuthn options to react-native-passkey format
2. Handle Base64URL encoding/decoding for ArrayBuffers
3. Extract public keys from native attestation objects
4. Return signatures in the correct format

---

## 4. UI-Native Package Architecture

### Directory Structure

```
packages/ui-native/src/
├── components/
│   ├── ui/                          # Base components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   ├── checkbox.tsx
│   │   ├── avatar.tsx
│   │   ├── accordion.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── spinner.tsx
│   │   ├── label.tsx
│   │   ├── form.tsx
│   │   └── scroll-area.tsx
│   ├── ConnectModal/                # Connection confirmation
│   ├── OnboardingModal/             # Account creation/selection
│   ├── SignatureModal/              # Message signing
│   ├── TransactionModal/            # Transaction confirmation
│   ├── PermissionModal/             # Permission granting
│   └── DefaultModal/                # Base modal wrapper
├── cross-platform/
│   ├── BrowserAuthenticator.ts      # Safari/Chrome tab handler
│   └── index.ts
├── react-native/
│   ├── ReactNativeUIHandler.tsx     # UIHandler implementation
│   ├── wrappers/                    # Modal wrapper components
│   │   ├── OnboardingModalWrapper.tsx
│   │   ├── SignatureModalWrapper.tsx
│   │   ├── SiweModalWrapper.tsx
│   │   ├── Eip712ModalWrapper.tsx
│   │   ├── TransactionModalWrapper.tsx
│   │   ├── PermissionModalWrapper.tsx
│   │   └── RevokePermissionModalWrapper.tsx
│   └── utils/
│       ├── chainUtils.ts            # Chain metadata
│       └── messageUtils.ts          # Message parsing
├── passkey/
│   ├── create-adapter.ts            # Passkey creation adapter
│   ├── get-adapter.ts               # Passkey signing adapter
│   └── utils.ts                     # Base64 utilities
├── hooks/
│   ├── useDeviceType.ts             # Phone/tablet detection
│   └── useChainIcon.tsx             # Chain icon resolver
├── icons/
│   └── index.tsx                    # SVG icon components
├── utils/
│   ├── coingecko.ts                 # ETH/USD conversion
│   ├── formatAddress.ts             # Address truncation
│   ├── platform.ts                  # Platform detection
│   └── justaNameInstance.ts         # JustAName SDK setup
├── JAWNativeProvider.tsx            # Cross-platform provider
└── index.ts                         # Main exports
```

### Key Components

#### JAWNativeProvider (Cross-Platform Mode)
- React Context provider managing BrowserAuthenticator
- State: `isConnected`, `address`, `username`, `chainId`
- Methods: `connect()`, `disconnect()`, `signMessage()`, `sendTransaction()`, `signTypedData()`
- Hook: `useJAWNative()`

#### ReactNativeUIHandler (App-Specific Mode)
- Implements `UIHandler` interface from @jaw.id/core
- Routes UI requests to appropriate modal wrappers
- Promise-based request/response pattern
- Integrates with UIHandlerProvider context

#### Modal Wrappers
Bridge between UI modals and core SDK:
- **OnboardingModalWrapper**: Account creation with `Account.create()`, account selection with `Account.get()`
- **SignatureModalWrapper**: Message signing with `account.signMessage()`
- **Eip712ModalWrapper**: EIP-712 typed data signing
- **TransactionModalWrapper**: Transaction confirmation with `account.sendTransaction()`
- **PermissionModalWrapper**: Permission granting with `account.grantPermissions()`

#### Passkey Adapters

**create-adapter.ts**:
```typescript
export const createCredentialAdapter: PasskeyCreateFn = async (options) => {
  // Convert viem options to react-native-passkey format
  // Call Passkey.create()
  // Extract public key from attestation
  // Return credential compatible with toWebAuthnAccount()
}

export const createNativePasskeyCredential: NativePasskeyCreateFn = async (options) => {
  // Direct React Native passkey creation without crypto.subtle
  // Used when viem's createWebAuthnCredential isn't compatible
}
```

**get-adapter.ts**:
```typescript
export const getCredentialAdapter: PasskeyGetFn = async (options) => {
  // Convert viem credential request options
  // Call Passkey.get()
  // Return signature in correct format
}
```

### Styling System

- **NativeWind 4.0**: Tailwind CSS for React Native
- **CVA (class-variance-authority)**: Component variants
- **HSL Color System**: Semantic colors (primary, secondary, destructive, muted)
- **Responsive**: useDeviceType hook for phone/tablet breakpoints

### Platform Detection (`utils/platform.ts`)

```typescript
isExpoGo(): boolean                    // Detects Expo Go environment
canUseNativePasskeys(): boolean         // Checks iOS 15+ / Android API 28+
getNativePasskeyUnavailableReason(): string  // User-friendly error messages
```

---

## 5. Demo-Native Playground

### Key Features

#### Components Screen (`components.tsx`)
- Showcase of all UI components (241 lines)
- 8 sections: Buttons, Inputs, Cards, Modals, etc.
- Interactive examples

#### Connect Screen (`connect.tsx`) - Main Demo (1,179 lines)
- **Mode Toggle**: Switch between Cross-Platform and App-Specific
- **Cross-Platform Section** (lines 106-423):
  - Connect/Disconnect buttons
  - Sign message with input
  - Send transaction
  - Sign typed data
- **App-Specific Section** (lines 425-1077):
  - Account creation with username input
  - Account import from cloud backup
  - Stored accounts list with selection
  - Sign message modal
  - Send transaction modal
  - Grant/revoke permissions
  - Extensive logging for debugging

### Critical Setup

#### Entry Point (`index.js`)
**MUST load crypto polyfills BEFORE any other code**:
```javascript
// Critical: Load polyfills FIRST
import 'react-native-get-random-values';
import { install } from 'react-native-quick-crypto';
install();
import 'react-native-url-polyfill/auto';

// Generate UUID polyfill
if (!crypto.randomUUID) {
  crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
}

// Then import and register app
import { registerRootComponent } from 'expo';
import App from './app/_layout';
registerRootComponent(App);
```


#### Expo Configuration (`app.json`)
```json
{
  "expo": {
    "name": "JAW Demo Native",
    "slug": "jaw-demo-native",
    "version": "1.0.0",
    "orientation": "portrait",
    "newArchEnabled": true,
    "ios": {
      "bundleIdentifier": "id.jaw.demo.native",
      "developmentTeam": "9234ZPYS2R",
      "associatedDomains": ["webcredentials:your-domain.com"]
    },
    "android": {
      "package": "com.jaw.demo",
      "adaptiveIcon": { "..." }
    },
    "plugins": ["expo-router", "expo-web-browser"]
  }
}
```

---

## 6. Configuration Requirements

### Environment Variables

Create `.env` file in `playground/demo-native/`:

```bash
EXPO_PUBLIC_API_KEY=your-api-key-here
EXPO_PUBLIC_DEFAULT_CHAIN_ID=11155111  # Sepolia testnet
EXPO_PUBLIC_RP_ID=your-domain.com
EXPO_PUBLIC_RP_NAME=Your App Name
EXPO_PUBLIC_KEYS_URL=https://keys.jaw.id  # Can use ngrok for local dev
```

### iOS Setup (App-Specific Mode)

1. **Associated Domains**:
   - Add to `app.json`: `"associatedDomains": ["webcredentials:your-domain.com"]`
   - Requires Apple Developer Team ID

2. **AASA File** (Apple App Site Association):
   Place at `https://your-domain.com/.well-known/apple-app-site-association`:
   ```json
   {
     "webcredentials": {
       "apps": ["9234ZPYS2R.id.jaw.demo.native"]
     }
   }
   ```
   Format: `TEAM_ID.BUNDLE_ID`

3. **Minimum iOS**: 15.0 (for passkey support)

4. **Physical Device Required**: Simulators don't support WebAuthn

### Android Setup (App-Specific Mode)

1. **assetlinks.json**:
   Place at `https://your-domain.com/.well-known/assetlinks.json`:
   ```json
   [{
     "relation": ["delegate_permission/common.get_login_creds"],
     "target": {
       "namespace": "android_app",
       "package_name": "com.jaw.demo",
       "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
     }
   }]
   ```

2. **Get SHA256 Fingerprint**:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   ```

3. **Minimum Android**: API 28 (Android 9.0)

4. **Physical Device Required**: Emulators don't support WebAuthn

### Cross-Platform Mode Setup

**No additional configuration needed!**
- Works in Expo Go
- No AASA/assetlinks.json required
- Just needs API key and keys.jaw.id URL

---

## 7. Testing Instructions

### Quick Start

```bash
# Install dependencies
cd playground/demo-native
bun install

# Create .env file
cp .env.example .env
# Edit .env with your API key

# Start Expo dev server
bunx nx dev @playground/demo-native

# iOS: Press 'i' for simulator (cross-platform mode only)
# Android: Press 'a' for emulator (cross-platform mode only)
```

### Testing Cross-Platform Mode

1. **In Expo Go** (easiest):
   ```bash
   bunx nx dev @playground/demo-native
   # Scan QR code with Expo Go app
   ```

2. **Test Flow**:
   - Select "Cross-Platform" mode in demo
   - Tap "Connect Wallet"
   - Safari/Chrome opens with keys.jaw.id
   - Complete passkey authentication
   - Browser redirects back to app
   - App shows connected state with address

3. **Test Operations**:
   - Sign message
   - Send transaction
   - Sign typed data (EIP-712)

### Testing App-Specific Mode

1. **Build Development Client** (required):
   ```bash
   # iOS
   bunx expo run:ios --device

   # Android
   bunx expo run:android --device
   ```

2. **Setup AASA** (if testing credential discovery):
   - Deploy AASA file to your domain
   - Update `app.json` with your domain
   - Rebuild app

3. **Test Flow**:
   - Select "App-Specific" mode in demo
   - Tap "Create Account"
   - Enter username (e.g., "test.jaw")
   - Face ID/Touch ID prompt appears
   - Complete biometric authentication
   - Account created and displayed

4. **Test Operations**:
   - Create multiple accounts
   - Import from cloud backup
   - Switch between accounts
   - Sign messages (modal UI)
   - Send transactions (modal UI)
   - Grant permissions
   - Revoke permissions

### Testing UI Components

Navigate to "Components" screen to see all UI components in action.

### Common Issues

**Issue**: "Passkeys unavailable in Expo Go"
- **Solution**: Use cross-platform mode or build development client

**Issue**: "Credential not found"
- **Solution**: Verify AASA file is deployed and accessible, ensure rpId matches your domain

**Issue**: "Module not found: eventemitter3"
- **Solution**: Check metro.config.js has resolveRequest fix

**Issue**: "crypto.randomUUID is not a function"
- **Solution**: Ensure index.js polyfills are loaded FIRST

---

### For Developers Getting Started

1. **Read this document** - Understand the architecture
2. **Run the demo** - `cd playground/demo-native && bunx nx dev @playground/demo-native`
3. **Test cross-platform mode** - Works immediately in Expo Go if using keys.jaw.id ( after merge of this branch )
4. **Build for app-specific** - `bunx expo run:ios --device` with AASA setup
5. **Review the code** - Start with `JAWNativeProvider.tsx` and `ReactNativeUIHandler.tsx`
6. **Check examples** - `playground/demo-native/app/connect.tsx` has extensive examples
