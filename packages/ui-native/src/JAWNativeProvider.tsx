/**
 * JAWNativeProvider
 *
 * React Native provider for JAW SDK cross-platform mode.
 * Uses Safari View Controller (iOS) / Chrome Custom Tab (Android)
 * for authentication, which fully supports WebAuthn/passkeys.
 *
 * @example
 * ```tsx
 * import { JAWNativeProvider, useJAWNative } from '@jaw/ui-native';
 *
 * function App() {
 *   return (
 *     <JAWNativeProvider
 *       apiKey="your-api-key"
 *       appName="My App"
 *       defaultChainId={1}
 *     >
 *       <MyApp />
 *     </JAWNativeProvider>
 *   );
 * }
 *
 * function MyApp() {
 *   const { connect, isConnected, address } = useJAWNative();
 *
 *   return (
 *     <Button onPress={connect} title="Connect Wallet" />
 *   );
 * }
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  ReactNode,
} from 'react';
import { BrowserAuthenticator } from './cross-platform/BrowserAuthenticator';

// Default keys URL
const DEFAULT_KEYS_URL = 'https://keys.jaw.id';

export interface JAWNativeConfig {
  /** API key for JAW services */
  apiKey: string;
  /** App name displayed in auth UI */
  appName: string;
  /** App logo URL */
  appLogoUrl?: string;
  /** Default chain ID */
  defaultChainId?: number;
  /** Custom keys URL (default: https://keys.jaw.id) */
  keysUrl?: string;
  /** Show testnet chains */
  showTestnets?: boolean;
}

export interface JAWNativeContextType {
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: string | null;
  /** Connected username */
  username: string | null;
  /** Current chain ID */
  chainId: number | null;
  /** Open the connect modal */
  connect: () => Promise<string | null>;
  /** Disconnect wallet */
  disconnect: () => void;
  /** Sign a message */
  signMessage: (message: string) => Promise<string | null>;
  /** Sign typed data (EIP-712) */
  signTypedData: (typedData: object) => Promise<string | null>;
  /** Send transaction */
  sendTransaction: (tx: { to: string; value?: string; data?: string }) => Promise<string | null>;
  /** Whether modal is open */
  isModalOpen: boolean;
  /** Open modal */
  openModal: () => void;
  /** Close modal */
  closeModal: () => void;
}

const JAWNativeContext = createContext<JAWNativeContextType | null>(null);

export interface JAWNativeProviderProps extends JAWNativeConfig {
  children: ReactNode;
}

/**
 * JAWNativeProvider
 *
 * Provides JAW SDK functionality using Safari View Controller / Chrome Custom Tab.
 * These real browser sessions fully support WebAuthn/passkeys.
 */
export function JAWNativeProvider({
  children,
  apiKey,
  appName,
  appLogoUrl,
  defaultChainId = 1,
  keysUrl = DEFAULT_KEYS_URL,
  showTestnets = false,
}: JAWNativeProviderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(defaultChainId);

  // Create browser authenticator
  const authenticator = useMemo(() => new BrowserAuthenticator({
    apiKey,
    appName,
    appLogoUrl,
    defaultChainId,
    keysUrl,
    showTestnets,
  }), [apiKey, appName, appLogoUrl, defaultChainId, keysUrl, showTestnets]);

  // Warm up browser on mount, cool down on unmount
  useEffect(() => {
    BrowserAuthenticator.warmUp();
    return () => {
      BrowserAuthenticator.coolDown();
    };
  }, []);

  // Open modal (for backwards compatibility, triggers connect)
  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Connect wallet using browser
  const connect = useCallback(async (): Promise<string | null> => {
    try {
      setIsConnecting(true);
      setIsModalOpen(true);

      const result = await authenticator.connect();

      if (result.success && result.address) {
        setAddress(result.address);
        setUsername(result.username || null);
        setCredentialId(result.credentialId || null);
        setIsConnected(true);
        setIsModalOpen(false);
        return result.address;
      } else {
        setIsModalOpen(false);
        return null;
      }
    } catch (error) {
      console.error('[JAWNativeProvider] Connect error:', error);
      setIsModalOpen(false);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [authenticator]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAddress(null);
    setUsername(null);
    setCredentialId(null);
    closeModal();
  }, [closeModal]);

  // Sign message using browser flow
  const signMessage = useCallback(async (message: string): Promise<string | null> => {
    if (!credentialId) {
      console.error('[JAWNativeProvider] No credentialId - must connect first');
      return null;
    }

    try {
      const result = await authenticator.signMessage({
        message,
        credentialId,
      });

      if (result.success && result.signature) {
        return result.signature;
      }
      return null;
    } catch (error) {
      console.error('[JAWNativeProvider] Sign message error:', error);
      return null;
    }
  }, [authenticator, credentialId]);

  // Sign typed data (EIP-712) using browser flow
  const signTypedData = useCallback(async (typedData: object): Promise<string | null> => {
    if (!credentialId) {
      console.error('[JAWNativeProvider] No credentialId - must connect first');
      return null;
    }

    try {
      const result = await authenticator.signTypedData({
        typedData: JSON.stringify(typedData),
        credentialId,
      });

      if (result.success && result.signature) {
        return result.signature;
      }
      return null;
    } catch (error) {
      console.error('[JAWNativeProvider] Sign typed data error:', error);
      return null;
    }
  }, [authenticator, credentialId]);

  // Send transaction using browser flow
  const sendTransaction = useCallback(async (tx: {
    to: string;
    value?: string;
    data?: string;
  }): Promise<string | null> => {
    if (!credentialId) {
      console.error('[JAWNativeProvider] No credentialId - must connect first');
      return null;
    }

    try {
      const result = await authenticator.sendTransaction({
        ...tx,
        credentialId,
        chainId: chainId || undefined,
      });

      if (result.success && result.txHash) {
        return result.txHash;
      }
      return null;
    } catch (error) {
      console.error('[JAWNativeProvider] Send transaction error:', error);
      return null;
    }
  }, [authenticator, credentialId, chainId]);

  // Context value
  const contextValue = useMemo<JAWNativeContextType>(() => ({
    isConnected,
    address,
    username,
    chainId,
    connect,
    disconnect,
    signMessage,
    signTypedData,
    sendTransaction,
    isModalOpen,
    openModal,
    closeModal,
  }), [
    isConnected,
    address,
    username,
    chainId,
    connect,
    disconnect,
    signMessage,
    signTypedData,
    sendTransaction,
    isModalOpen,
    openModal,
    closeModal,
  ]);

  return (
    <JAWNativeContext.Provider value={contextValue}>
      {children}
    </JAWNativeContext.Provider>
  );
}

/**
 * Hook to access JAW Native context
 */
export function useJAWNative(): JAWNativeContextType {
  const context = useContext(JAWNativeContext);
  if (!context) {
    throw new Error('useJAWNative must be used within JAWNativeProvider');
  }
  return context;
}

export default JAWNativeProvider;
