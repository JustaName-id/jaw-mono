# JAW Core Package Architecture

## Overview

The JAW Core package implements an EIP-1193 compliant Ethereum provider with passkey-based authentication and end-to-end encrypted communication. It uses a layered architecture with clear separation of concerns.

## Architecture Diagram

```mermaid
graph TB
    subgraph "Public API Layer"
        SDK[createJAWSDK]
        SDK_Methods["getProvider()<br/>disconnect()<br/>isConnected()"]
    end

    subgraph "Provider Layer (EIP-1193)"
        Provider[JAWProvider]
        EventEmitter[ProviderEventEmitter]
        Provider --> EventEmitter
        Provider_Methods["request(args)<br/>enable()<br/>disconnect()"]
    end

    subgraph "Signer Layer"
        JAWSigner[JAWSigner]
        SignerUtils[SignerUtils]
        JAWSigner --> SignerUtils
        Signer_Methods["handshake()<br/>request()<br/>cleanup()"]
    end

    subgraph "Communication Layer"
        Communicator[Communicator]
        Comm_Methods["postMessage()<br/>onMessage()<br/>waitForPopupLoaded()"]
    end

    subgraph "Cryptography Layer"
        KeyManager[KeyManager]
        CryptoUtils[Crypto Utils]
        KeyManager --> CryptoUtils
        Crypto_Methods["getOwnPublicKey()<br/>setPeerPublicKey()<br/>getSharedSecret()"]
    end

    subgraph "Storage Layer"
        Store[Zustand Store]
        StorageManager[Storage Manager]
        PasskeyManager[Passkey Manager]
        Store_Slices["account slice<br/>chains slice<br/>keys slice<br/>config slice"]
        Store --> Store_Slices
    end

    subgraph "External Services"
        Popup[JAW Keys Popup<br/>keys.jaw.id]
        Backend[Passkey Backend API<br/>api.justaname.id]
        RPC[RPC Endpoints]
    end

    SDK --> Provider
    Provider --> JAWSigner
    JAWSigner --> Communicator
    JAWSigner --> KeyManager
    JAWSigner --> Store

    Communicator --> Popup
    PasskeyManager --> Backend
    Provider --> PasskeyManager
    JAWSigner --> RPC

    KeyManager --> StorageManager
    PasskeyManager --> StorageManager

    style SDK fill:#e1f5ff
    style Provider fill:#fff4e1
    style JAWSigner fill:#ffe1f5
    style Communicator fill:#e1ffe1
    style KeyManager fill:#f5e1ff
    style Store fill:#ffe1e1
```

## Component Layers

### 1. Public API Layer
**Entry Point**: `createJAWSDK(options)`
- Factory function that creates SDK instance
- Lazy initialization of provider
- Manages provider lifecycle

**Responsibilities**:
- Simple, developer-friendly interface
- Configuration management
- Provider instance management

### 2. Provider Layer (EIP-1193 Compliant)
**Main Class**: `JAWProvider`
- Implements EIP-1193 provider interface
- Event emitter for blockchain events
- Request routing and lifecycle management

**Key Features**:
- Correlation ID tracking for request lifecycle
- Automatic signer initialization
- Error serialization and handling
- Support for ephemeral signers (one-off operations)

**Request Flow**:
```
request() → _request() → signer.request() → return result
     ↓
  correlationId
  management
```

### 3. Signer Layer
**Main Class**: `JAWSigner`
- Handles authentication and request signing
- Manages encrypted communication with popup
- Multi-chain support and chain switching

**Responsibilities**:
- Session key exchange (handshake)
- Request encryption/decryption
- Account and chain state management
- RPC method routing

**Supported Flows**:
- **Authenticated**: eth_accounts, personal_sign, eth_sendTransaction, etc.
- **Unauthenticated**: wallet_connect, wallet_sendCalls, wallet_sign (ephemeral)
- **Local**: eth_chainId, net_version, wallet_switchEthereumChain

### 4. Communication Layer
**Main Class**: `Communicator`
- Manages popup window lifecycle
- PostMessage-based communication
- Origin validation and security

**Features**:
- Popup window management (center-screen positioning)
- Message routing with correlation IDs
- Event listener cleanup
- Popup load detection

### 5. Cryptography Layer
**Main Class**: `KeyManager`
- ECDH P-256 key pair generation
- Shared secret derivation
- Key persistence and rotation

**Security Features**:
- AES-GCM encryption for all sensitive data
- Diffie-Hellman key exchange
- Race condition protection
- Automatic key generation

**Crypto Flow**:
```
generateKeyPair() → storeKeys() → exchangePublicKeys() → deriveSharedSecret()
```

### 6. Storage Layer

**Zustand Store**:
- Centralized state management
- localStorage persistence
- State slicing for organization

**Storage Manager**:
- Multiple backends (localStorage, IndexedDB, memory)
- Scoped keys prevent collisions
- Sync and async interfaces

**Passkey Manager**:
- Passkey credential management
- Backend integration for passkey registration
- Account metadata storage

## Request Flow Sequence

### Initial Authentication Flow

```mermaid
sequenceDiagram
    participant App as dApp
    participant SDK as JAW SDK
    participant Provider as JAWProvider
    participant Signer as JAWSigner
    participant KeyMgr as KeyManager
    participant Comm as Communicator
    participant Popup as Keys Popup

    App->>SDK: jaw.getProvider()
    SDK->>Provider: new JAWProvider()

    App->>Provider: request({method: 'eth_requestAccounts'})
    Provider->>Provider: Generate correlationId
    Provider->>Signer: fetchSignerType()

    Signer->>Comm: waitForPopupLoaded()
    Comm->>Popup: window.open()
    Popup->>Comm: 'PopupLoaded' event

    Provider->>Signer: createSigner('scw')
    Provider->>Signer: handshake()

    Signer->>KeyMgr: getOwnPublicKey()
    KeyMgr->>KeyMgr: generateKeyPair()
    KeyMgr-->>Signer: publicKey

    Signer->>Comm: postRequestAndWaitForResponse(handshakeMsg)
    Comm->>Popup: postMessage({handshake})

    Popup-->>Comm: postMessage({encrypted, sender: peerPublicKey})
    Comm-->>Signer: response

    Signer->>KeyMgr: setPeerPublicKey(peerPublicKey)
    KeyMgr->>KeyMgr: deriveSharedSecret()

    Signer->>Signer: decryptResponseMessage()
    Signer->>Signer: handleResponse() - store accounts

    Signer-->>Provider: accounts[]
    Provider->>Provider: storeSignerType()
    Provider-->>App: accounts[]
```

### Encrypted Request Flow (After Authentication)

```mermaid
sequenceDiagram
    participant App as dApp
    participant Provider as JAWProvider
    participant Signer as JAWSigner
    participant KeyMgr as KeyManager
    participant Comm as Communicator
    participant Popup as Keys Popup

    App->>Provider: request({method: 'personal_sign', params})
    Provider->>Provider: Set correlationId
    Provider->>Signer: request(args)

    Signer->>KeyMgr: getSharedSecret()
    KeyMgr-->>Signer: sharedSecret

    Signer->>Signer: encryptContent({action, chainId}, sharedSecret)
    Signer->>Comm: postRequestAndWaitForResponse({encrypted})

    Comm->>Popup: postMessage({encrypted})
    Popup->>Popup: User approves/rejects

    Popup-->>Comm: postMessage({encrypted: result})
    Comm-->>Signer: response

    Signer->>KeyMgr: getSharedSecret()
    Signer->>Signer: decryptContent(encrypted, sharedSecret)

    Signer->>Signer: handleResponse()
    Signer-->>Provider: result

    Provider->>Provider: Delete correlationId
    Provider-->>App: result
```

### Chain Switching Flow

```mermaid
sequenceDiagram
    participant App as dApp
    participant Provider as JAWProvider
    participant Signer as JAWSigner
    participant Store as Zustand Store

    App->>Provider: request({method: 'wallet_switchEthereumChain', params: [{chainId: '0x89'}]})
    Provider->>Signer: request(args)

    Signer->>Signer: handleSwitchChainRequest()
    Signer->>Store: getState().chains
    Store-->>Signer: chains[]

    alt Chain found locally
        Signer->>Signer: updateChain(137)
        Signer->>Store: account.set({chain})
        Signer->>Provider: callback('chainChanged', '0x89')
        Signer-->>Provider: null (success)
    else Chain not found
        Signer->>Signer: sendRequestToPopup()
        Note over Signer,Popup: Full encrypted request flow
        Signer->>Store: chains.set(newChains)
        Signer->>Signer: updateChain(137)
        Signer-->>Provider: null (success)
    end

    Provider-->>App: null
```

## Data Flow Patterns

### State Management Flow

```mermaid
graph TB
    subgraph Read["Read Path"]
        Component[Component] --> GetState[store.getState]
        GetState --> ReadLS[Read from localStorage]
        ReadLS --> ReturnState[Return State]
    end

    subgraph Write["Write Path"]
        Update[store.account.set] --> StateUpdate[Update Zustand State]
        StateUpdate --> Middleware[Persist Middleware]
        Middleware --> WriteLS[Write to localStorage]
    end

    style Component fill:#e1f5ff
    style Update fill:#ffe1e1
    style ReadLS fill:#f5f5f5
    style WriteLS fill:#f5f5f5
```

### Encryption Flow

```mermaid
graph TB
    subgraph Encrypt["Encryption - Request"]
        PlainText[Plain Request Object] --> Serialize[JSON.stringify]
        Serialize --> EncryptData[Encrypted Data]
        SharedSecret1[Shared Secret AES-256] --> EncryptData
        IV1[Random IV 12 bytes] --> EncryptData
        EncryptData --> EncryptResult["Encrypted Message<br/>iv + cipherText"]
    end

    subgraph Decrypt["Decryption - Response"]
        EncryptedMsg["Encrypted Message<br/>iv + cipherText"] --> DecryptData[AES-GCM Decrypt]
        SharedSecret2[Shared Secret AES-256] --> DecryptData
        DecryptData --> Deserialize[JSON.parse]
        Deserialize --> Result[Response Object]
    end

    style PlainText fill:#e1f5ff
    style EncryptResult fill:#ffe1e1
    style EncryptedMsg fill:#ffe1e1
    style Result fill:#e1ffe1
```

## Security Architecture

### Key Exchange (ECDH)

```mermaid
graph TB
    subgraph "Client Side (dApp)"
        ClientPriv[Client Private Key<br/>ECDH P-256]
        ClientPub[Client Public Key]
        ClientPriv -.generates.-> ClientPub
    end

    subgraph "Server Side (Popup)"
        ServerPriv[Server Private Key<br/>ECDH P-256]
        ServerPub[Server Public Key]
        ServerPriv -.generates.-> ServerPub
    end

    subgraph "Shared Secret Derivation"
        ClientPub --> DeriveClient[ECDH<br/>Client Private + Server Public]
        ServerPriv --> DeriveClient

        ServerPub --> DeriveServer[ECDH<br/>Server Private + Client Public]
        ClientPriv --> DeriveServer

        DeriveClient --> SharedSecret[Same Shared Secret<br/>AES-GCM 256-bit]
        DeriveServer --> SharedSecret
    end

    style ClientPriv fill:#ffe1e1
    style ServerPriv fill:#ffe1e1
    style SharedSecret fill:#e1ffe1
```

### Message Security

```
┌─────────────────────────────────────────────────────┐
│ RPCRequestMessage                                   │
├─────────────────────────────────────────────────────┤
│ id: string (UUID)                                   │
│ correlationId: string (tracking)                    │
│ sender: string (hex public key)                     │
│ timestamp: Date                                     │
│ content: {                                          │
│   encrypted: {                                      │
│     iv: Uint8Array (12 bytes)                      │
│     cipherText: ArrayBuffer                        │
│   }                                                 │
│ }                                                   │
└─────────────────────────────────────────────────────┘

Encrypted Content = AES-GCM(
  plaintext: JSON.stringify({action, chainId}),
  key: sharedSecret,
  iv: random 12 bytes
)
```

## Storage Schema

### Zustand Store (localStorage: `jawsdk.store`)

```typescript
{
  account: {
    accounts?: Address[],           // Connected wallet addresses
    chain?: {                        // Current chain
      id: number,
      rpcUrl?: string,
      nativeCurrency?: {...}
    },
    capabilities?: Record<string, unknown>  // EIP-5792 capabilities
  },
  chains: Array<{                   // Available chains
    id: number,
    rpcUrl: string,
    nativeCurrency?: {...}
  }>,
  keys: Record<string, string>,     // Reserved for future use
  config: {
    metadata?: AppMetadata,
    version: string
  }
}
```

### KeyManager Storage (localStorage: `jaw:keys:*`)

```
jaw:keys:ownPrivateKey    → Hex-encoded ECDH private key
jaw:keys:ownPublicKey     → Hex-encoded ECDH public key
jaw:keys:peerPublicKey    → Hex-encoded peer public key
```

### PasskeyManager Storage (localStorage: `jaw:passkey:*`)

```
jaw:passkey:authState     → {isLoggedIn, address, credentialId}
jaw:passkey:accounts      → Array<PasskeyAccount>
```

### Signer Type Storage (localStorage: `jaw:signer:type`)

```
jaw:signer:type           → 'scw' | other signer types
```

## Error Handling Strategy

### Error Categories

```mermaid
graph TB
    Error[Error Occurs]
    Error --> Type{Error Type}

    Type --> |code: 4001| UserRejected[User Rejected<br/>standardErrors.provider.userRejectedRequest]
    Type --> |code: 4100| Unauthorized[Unauthorized<br/>→ disconnect + throw]
    Type --> |code: 4200| UnsupportedMethod[Unsupported Method]
    Type --> |code: -32000 to -32099| ServerError[Server Error]
    Type --> |code: -32600| InvalidRequest[Invalid Request]

    UserRejected --> Serialize[serializeError]
    Unauthorized --> Serialize
    UnsupportedMethod --> Serialize
    ServerError --> Serialize
    InvalidRequest --> Serialize

    Serialize --> Return[Reject Promise]

    style UserRejected fill:#fff4e1
    style Unauthorized fill:#ffe1e1
    style Return fill:#e1e1e1
```