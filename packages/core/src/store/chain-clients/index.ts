export { ChainClients, chainClientStore, type ChainConfig, type ChainClientState } from './store.js';

export {
  createChainConfigs,
  getChainConfig,
  getRpcUrl,
  hasChainConfig,
  addChainConfig,
  removeChainConfig,
  getAllChainConfigs,
  clearChainConfigs,
  type SDKChain,
} from './utils.js';

// Re-export from messages to avoid duplication
export type { RPCResponseNativeCurrency } from '../../messages/rpcMessage.js';

