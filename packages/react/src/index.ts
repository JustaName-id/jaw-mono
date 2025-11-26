// Import UI styles - makes @jaw/react completely self-contained
import '@jaw/ui/style.css';

// Provider components
export { JAWProvider, type JAWProviderProps } from './JAWProvider';
export { JAWUIProvider, type JAWUIProviderProps } from './JAWUIProvider';

// Context
export { JAWContext, useJAWProvider } from './context';

// Hooks
export {
  useJAW,
  useAddress,
  useChainId,
  useSendTransaction,
  useSignMessage,
  type TransactionCall,
  type SendTransactionResult,
} from './hooks';

// Re-export commonly used types from core
export { Mode, type ModeType } from '@jaw.id/core';