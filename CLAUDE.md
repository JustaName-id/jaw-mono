# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

JAW.id is an Nx monorepo for building smart account wallet infrastructure. It provides an EIP-1193 compliant provider for interacting with smart accounts, supporting both cross-platform (popup) and app-specific (embedded) authentication modes via passkeys.

## Common Commands

```bash
# Install dependencies
bun install

# Build all packages
bunx nx run-many -t build

# Build a specific package
bunx nx build @jaw.id/core
bunx nx build @jaw.id/wagmi
bunx nx build @jaw.id/ui

# Run tests for a package
bunx nx test @jaw.id/core

# Run a single test file
cd packages/core && bunx vitest run src/path/to/file.test.ts

# Lint all packages
bunx nx run-many -t lint

# Lint a specific package
bunx nx lint @jaw.id/core

# Typecheck
bunx nx run-many -t typecheck

# Run the playground Next.js app
bunx nx dev @jaw-mono/playground

# Run the docs site (uses Vocs)
bunx nx dev docs

# View project dependency graph
bunx nx graph

# Release packages
bunx nx release
```

## Architecture

### Publishable Packages (`packages/`)

- **@jaw.id/core** - Core SDK providing `JAWProvider` (EIP-1193 provider), `Account` class for smart account operations, passkey management, and RPC handling. Entry point is `JAW.create()` factory function.
- **@jaw.id/wagmi** - Wagmi connector wrapping core SDK. Exports `jaw()` connector factory, React hooks (`useConnect`, `useGrantPermissions`, etc.), and TanStack Query utilities.
- **@jaw.id/ui** - React UI components (Radix-based) for wallet dialogs: onboarding, transaction signing, permission management. Exports `ReactUIHandler` for app-specific mode integration.
- **@jaw.id/cli** - CLI tool (`jaw` binary) and MCP server for terminal/AI agent interaction with smart accounts. Uses oclif framework. All traffic E2E encrypted (ECDH P-256 + AES-256-GCM).

### Applications (`apps/`)

- **playground** - Next.js demo app using @jaw.id/wagmi with Privy authentication
- **keys-jaw-id** - Next.js keys management application (keys.jaw.id)
- **docs** - Documentation site built with Vocs

### Smart Contracts (`contracts/`)

Git submodules containing Foundry projects:
- **justanaccount** - smart account implementation
- **permissions** - Permission manager contract for delegated access control

### Core SDK Architecture

The `@jaw.id/core` package follows this structure:

1. **Provider Layer** (`src/provider/`) - `JAWProvider` implements EIP-1193, handling RPC requests and routing to appropriate handlers
2. **Account Layer** (`src/account/`) - `Account` class wraps smart account operations: signing, transactions, permission management
3. **Signer Layer** (`src/signer/`) - Two signer implementations:
   - `CrossPlatformSigner` - Uses popup window to keys.jaw.id for signing
   - `AppSpecificSigner` - Direct passkey signing within the app
4. **RPC Handlers** (`src/rpc/`) - Individual handlers for wallet methods (wallet_sendCalls, wallet_grantPermissions, etc.)
5. **State Management** (`src/store/`) - Zustand stores for config, chains, and client instances

### Authentication Modes

- **CrossPlatform** (default) - Opens popup to keys.jaw.id for passkey authentication. Credentials portable across apps.
- **AppSpecific** - Passkeys stored per-app. Requires implementing `UIHandler` interface for custom UI.

### Key External Dependencies

- **viem** - Ethereum interactions and smart account utilities
- **ox** - Low-level crypto operations
- **@justaname.id/sdk** - ENS subname resolution
- **wagmi/TanStack Query** - React integration (wagmi package)