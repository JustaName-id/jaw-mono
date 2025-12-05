// High-level Account API (recommended)
export {
    Account,
    type AccountConfig,
    type CreateAccountOptions,
    type TransactionCall,
    type AccountMetadata,
} from "./Account.js"

// Call status types (EIP-5792)
export {
    type CallReceipt,
    type CallStatusResponse,
} from "../rpc/wallet_sendCalls.js"

// Chain configuration
export {
    SUPPORTED_CHAINS,
    MAINNET_CHAINS,
    TESTNET_CHAINS,
    getSupportedChains,
} from "./smartAccount.js"

// Advanced: Low-level smart account creation (for custom implementations)
export {
    toJustanAccount,
    type ToJustanAccountParameters,
    type ToJustanAccountReturnType,
} from "./toJustanAccount.js"