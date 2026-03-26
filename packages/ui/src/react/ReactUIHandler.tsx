'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  UIHandler,
  UIHandlerConfig,
  UIRequest,
  UIResponse,
  UIError,
  UIErrorCode,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  SendTransactionUIRequest,
  PermissionUIRequest,
  RevokePermissionUIRequest,
  WalletSignUIRequest,
  Account,
  SUPPORTED_CHAINS,
  JAW_RPC_URL,
  JAW_PAYMASTER_URL,
  SubnameTextRecordCapabilityRequest,
  getPermissionFromRelay,
  handleGetCapabilitiesRequest,
  buildGrantPermissionCall,
  buildRevokePermissionCall,
  type Chain,
  type SignInWithEthereumCapabilityRequest,
  type PaymasterConfig,
  type FeeTokenCapability,
  ensureIntNumber,
  standardErrorCodes,
} from '@jaw.id/core';
import { formatUnits, erc20Abi, createPublicClient, http } from 'viem';
import type { Address, Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';

// Import UI components using relative paths (we're inside @jaw.id/ui)
import { OnboardingDialog } from '../components/OnboardingDialog';
import { DefaultDialog, type DefaultDialogProps } from '../components/DefaultDialog';
import { SignatureDialog } from '../components/SignatureDialog';
import { SiweDialog } from '../components/SiweDialog';
import { Eip712Dialog } from '../components/Eip712Dialog';
import { TransactionDialog } from '../components/TransactionDialog';
import { PermissionDialog } from '../components/PermissionDialog';
import { ConnectDialog } from '../components/ConnectDialog';
import { type FeeTokenOption } from '../components/FeeTokenSelector';
import { type LocalStorageAccount, type CreatedAccountData } from '../components/OnboardingDialog/types';
import { useChainIconURI } from '../hooks/useChainIconURI';
import { useFeeTokenPrice } from '../hooks/useFeeTokenPrice';
import { useGasEstimation } from '../hooks/useGasEstimation';
import { fetchTokenBalance, isNativeToken } from '../utils/tokenBalance';


/**
 * Converts hex string to UTF-8 string
 */
function hexToUtf8(hex: string): string {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Detects if a message is a SIWE (Sign-In with Ethereum) message
 * according to EIP-4361 specification
 */
function isSiweMessage(message: string): boolean {
  if (!message) return false;

  try {
    // If message is hex-encoded, decode it first
    let decodedMessage = message;
    if (message.startsWith('0x')) {
      decodedMessage = hexToUtf8(message);
    }

    // Primary detection: Check for the SIWE signature phrase
    const hasSiwePhrase = decodedMessage.includes('wants you to sign in with your Ethereum account');

    if (!hasSiwePhrase) {
      return false;
    }

    // Additional validation: Check for required SIWE fields
    const hasUri = /URI:\s*.+/.test(decodedMessage);
    const hasVersion = /Version:\s*1/.test(decodedMessage);
    const hasChainId = /Chain ID:\s*\d+/.test(decodedMessage);
    const hasNonce = /Nonce:\s*[a-zA-Z0-9]{8,}/.test(decodedMessage);
    const hasIssuedAt = /Issued At:\s*.+/.test(decodedMessage);

    return hasSiwePhrase && hasUri && hasVersion && hasChainId && hasNonce && hasIssuedAt;
  } catch (error) {
    console.error('Error checking if message is SIWE:', error);
    return false;
  }
}

// ============================================================================
// Chain Utilities
// ============================================================================

/**
 * Get chain name from chain ID
 */
function getChainNameFromId(chainId: number): string {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  return chain?.name || 'Unknown Network';
}

// ============================================================================
// Permission Utilities
// ============================================================================

// Format timestamp to readable date
const formatExpiryDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

// Token info cache type
type TokenInfoMap = Record<string, { decimals: number; symbol: string }>;

// Type assertion to fix React types version mismatch
const DefaultDialogComponent: React.ComponentType<DefaultDialogProps> = DefaultDialog as React.ComponentType<DefaultDialogProps>;

/**
 * React UI handler for app-specific mode
 *
 * This handler is automatically initialized by the SDK with the necessary configuration.
 * Simply pass a new instance to JAW.create() and the SDK will call init() with the config.
 *
 * @example
 * ```typescript
 * import { JAW, Mode } from '@jaw.id/core';
 * import { ReactUIHandler } from '@jaw.id/ui';
 *
 * const jaw = JAW.create({
 *   apiKey: 'your-api-key',
 *   defaultChainId: 1,
 *   preference: {
 *     mode: Mode.AppSpecific,
 *     uiHandler: new ReactUIHandler(),
 *   },
 * });
 * ```
 */
export class ReactUIHandler implements UIHandler {
  private config: UIHandlerConfig = {} as UIHandlerConfig;

  /**
   * Initialize the handler with SDK configuration
   * Called automatically by the SDK - do not call directly
   */
  init(config: UIHandlerConfig): void {
    this.config = config;
  }

  async request<T = unknown>(request: UIRequest): Promise<UIResponse<T>> {
    return new Promise((resolve, reject) => {
      try {
        const container = document.createElement('div');
        container.setAttribute('data-jaw-modal-container', '');

        // Append to body - Radix UI Dialog will handle all positioning
        document.body.appendChild(container);

        const root = createRoot(container);

        const cleanup = () => {
          try {
            document.body.style.removeProperty('pointer-events');

            root.unmount();
            if (container.parentNode) {
              container.parentNode.removeChild(container);
            }
          } catch (cleanupError) {
            console.error('[ReactUIHandler] Cleanup error:', cleanupError);
          }
        };

        const handleApprove = (data: T) => {
          cleanup();
          resolve({
            id: request.id,
            approved: true,
            data,
          });
        };

        const handleReject = (error?: Error) => {
          cleanup();
          const response = {
            id: request.id,
            approved: false,
            error: error as UIError || UIError.userRejected(),
          };
          resolve(response);
        };

        // Render appropriate dialog based on request type
        console.log('[ReactUIHandler] Rendering dialog for request type:', request.type);
        const dialog = this.renderDialog(request, handleApprove, handleReject);
        root.render(dialog);
        console.log('[ReactUIHandler] Dialog rendered');
      } catch (error) {
        console.error('[ReactUIHandler] Error in request:', error);
        reject(error);
      }
    });
  }

  canHandle(request: UIRequest): boolean {
    return [
      'wallet_connect',
      'personal_sign',
      'eth_signTypedData_v4',
      'wallet_sendCalls',
      'eth_sendTransaction',
      'wallet_grantPermissions',
      'wallet_revokePermissions',
      'wallet_sign',
    ].includes(request.type);
  }

  async cleanup(): Promise<void> {
    // Cleanup any remaining modals
    const containers = document.querySelectorAll('[data-jaw-modal-container]');
    containers.forEach((container: Element) => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    });
  }

  private renderDialog(
    request: UIRequest,
    onApprove: (data: any) => void,
    onReject: (error?: Error) => void
  ): React.ReactElement {
    switch (request.type) {
      case 'wallet_connect':
        return (
          <OnboardingDialogWrapper
            request={request as ConnectUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
            ens={this.config.ens}
          />
        );

      case 'personal_sign': {
        const signRequest = request as SignatureUIRequest;
        // Check if this is a SIWE message
        if (isSiweMessage(signRequest.data.message)) {
          return (
            <SiweDialogWrapper
              request={signRequest}
              onApprove={onApprove}
              onReject={onReject}
              apiKey={this.config.apiKey}
              defaultChainId={this.config.defaultChainId}
              paymasters={this.config.paymasters}
            />
          );
        }
        return (
          <SignatureDialogWrapper
            request={signRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );
      }

      case 'wallet_sign': {
        const walletSignRequest = request as WalletSignUIRequest;
        const signType = walletSignRequest.data.request.type;

        if (signType === '0x45') {
          // ERC-7871 PersonalSign - data is { message: string }
          const requestData = walletSignRequest.data.request.data as { message: string };
          const message = requestData.message;
          if (isSiweMessage(message)) {
            return (
              <SiweDialogWrapper
                request={{
                  ...walletSignRequest,
                  type: 'personal_sign',
                  data: {
                    message,
                    address: walletSignRequest.data.address,
                    chainId: walletSignRequest.data.chainId,
                  },
                } as SignatureUIRequest}
                onApprove={onApprove}
                onReject={onReject}
                apiKey={this.config.apiKey}
                defaultChainId={this.config.defaultChainId}
                paymasters={this.config.paymasters}
              />
            );
          }
          return (
            <SignatureDialogWrapper
              request={{
                ...walletSignRequest,
                type: 'personal_sign',
                data: {
                  message,
                  address: walletSignRequest.data.address,
                  chainId: walletSignRequest.data.chainId,
                },
              } as SignatureUIRequest}
              onApprove={onApprove}
              onReject={onReject}
              apiKey={this.config.apiKey}
              defaultChainId={this.config.defaultChainId}
              paymasters={this.config.paymasters}
            />
          );
        } else if (signType === '0x01') {
          // ERC-7871 TypedData - data can be either a JSON string or an object
          const typedDataRaw = walletSignRequest.data.request.data;
          // If it's already a string, use it directly; otherwise JSON.stringify it
          const typedDataJson = typeof typedDataRaw === 'string'
            ? typedDataRaw
            : JSON.stringify(typedDataRaw);
          return (
            <Eip712DialogWrapper
              request={{
                ...walletSignRequest,
                type: 'eth_signTypedData_v4',
                data: {
                  typedData: typedDataJson,
                  address: walletSignRequest.data.address,
                  chainId: walletSignRequest.data.chainId,
                },
              } as TypedDataUIRequest}
              onApprove={onApprove}
              onReject={onReject}
              apiKey={this.config.apiKey}
              defaultChainId={this.config.defaultChainId}
              paymasters={this.config.paymasters}
            />
          );
        } else {
          // Unsupported sign type
          return (
            <UnsupportedMethodDialogWrapper
              method={`wallet_sign (type: ${signType})`}
              onReject={onReject}
            />
          );
        }
      }

      case 'eth_signTypedData_v4':
        return (
          <Eip712DialogWrapper
            request={request as TypedDataUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );

      case 'wallet_sendCalls':
        return (
          <TransactionDialogWrapper
            request={request as TransactionUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );

      case 'eth_sendTransaction':
        return (
          <SendTransactionDialogWrapper
            request={request as SendTransactionUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );

      case 'wallet_grantPermissions':
        return (
          <PermissionDialogWrapper
            request={request as PermissionUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );

      case 'wallet_revokePermissions':
        return (
          <RevokePermissionDialogWrapper
            request={request as RevokePermissionUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasters={this.config.paymasters}
          />
        );

      default: {
        // Fallback for unsupported methods
        return (
          <UnsupportedMethodDialogWrapper
            method={(request as UIRequest).type}
            onReject={onReject}
          />
        );
      }
    }
  }
}

// Helper to build chain config with auto-resolved RPC URL from API key
// Used by OnboardingDialogWrapper which needs lower-level control
function buildChainConfigFromApiKey(chainId: number, apiKey?: string, paymasterUrl?: string): Chain {
  return {
    id: chainId,
    rpcUrl: apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`,
    ...(paymasterUrl && { paymaster: { url: paymasterUrl } }),
  };
}

// Helper to build mainnet RPC URL for JustaName SDK (ENS resolution always uses mainnet)
function getMainnetRpcUrl(apiKey?: string): string {
  return apiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=1`;
}

// Helper to get Account for signing operations
async function getAccountForSigning(
  apiKey?: string,
  chainId?: number,
  paymasterUrl?: string
): Promise<Account> {
  if (!apiKey) {
    throw new Error('API key is required for signing operations');
  }
  const targetChainId = chainId || 1;
  return await Account.get({
    chainId: targetChainId,
    apiKey,
    paymasterUrl,
  });
}

// OnboardingDialogWrapper - handles passkey authentication flow with ConnectDialog confirmation
function OnboardingDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
  ens,
}: {
  request: ConnectUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
  ens?: string;
}) {
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<LocalStorageAccount[]>([]);
  const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // State for ConnectDialog confirmation
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [authenticatedAccountName, setAuthenticatedAccountName] = useState<string | null>(null);
  const [authenticatedWalletAddress, setAuthenticatedWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // State for SIWE signing flow
  const [isSiweSigning, setIsSiweSigning] = useState(false);
  const [siweStatus, setSiweStatus] = useState<string>('');

  // Get rpId from current domain
  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const rpName = 'JAW';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  // Get chain info for ConnectDialog
  const targetChainId = request.data.chainId || defaultChainId || 1;
  const chainName = getChainNameFromId(targetChainId);
  const chainIcon = useChainIconURI(targetChainId, apiKey, 24);

  // Load accounts on mount using Account class
  useEffect(() => {
    const loadAccounts = () => {
      const storedAccounts = Account.getStoredAccounts(apiKey);
      setAccounts(storedAccounts.map(acc => ({
        username: acc.username,
        creationDate: new Date(acc.creationDate),
        credentialId: acc.credentialId,
        isImported: acc.isImported,
      })));
    };
    loadAccounts();
  }, [apiKey]);

  // Silent mode: check for existing auth state and use it directly
  // This mirrors the cross-platform behavior where jaw:passkey:authState is checked
  useEffect(() => {
    if (!request.data.silent) {
      return;
    }

    // Check if there's an existing authenticated session
    const authenticatedAddress = Account.getAuthenticatedAddress(apiKey);

    if (authenticatedAddress) {
      // User is already authenticated - approve immediately without showing any UI
      // Use setTimeout to defer the call and avoid unmounting during render
      console.log('🔇 Silent mode: using existing auth state, address:', authenticatedAddress);
      setTimeout(() => {
        onApprove({
          accounts: [{ address: authenticatedAddress }],
        });
      }, 0);
    }
    // If not authenticated, fall back to showing OnboardingDialog
    // (the normal UI flow will handle account creation/login)
  }, [request.data.silent, apiKey, onApprove]);

  const handleCancel = () => {
    setOpen(false);
    setShowConnectDialog(false);
    onReject(UIError.userRejected());
  };

  // Handle ConnectDialog confirmation
  const handleConnectConfirm = () => {
    if (authenticatedWalletAddress) {
      setIsConnecting(true);
      console.log('🔗 User approved connection');
      onApprove({
        accounts: [{ address: authenticatedWalletAddress }],
      });
    }
  };

  // Handle ConnectDialog cancel
  const handleConnectCancel = () => {
    setShowConnectDialog(false);
    setAuthenticatedAccountName(null);
    setAuthenticatedWalletAddress(null);
    setLoggingInAccount(null);
    // Return to account selection
  };

  // Handle selecting an existing account
  const handleAccountSelect = async (account: LocalStorageAccount) => {
    if (!account.credentialId) {
      console.error('No credential ID for account');
      return;
    }

    try {
      if (!apiKey) {
        throw new Error('API key is required');
      }
      setLoggingInAccount(account.username);

      // Use Account.get which handles WebAuthn authentication and stores auth state
      const accountInstance = await Account.get(
        {
          chainId: targetChainId,
          apiKey,
          paymasterUrl: paymasters?.[targetChainId]?.url,
        },
        account.credentialId
      );

      // If silent mode, skip ConnectDialog and approve immediately
      if (request.data.silent) {
        console.log('🔇 Silent mode: skipping connect confirmation');
        onApprove({
          accounts: [{ address: accountInstance.address }],
        });
        return;
      }

      // If SIWE is requested, show ConnectDialog for confirmation
      if (signInWithEthereumCapability) {
        setAuthenticatedAccountName(account.username);
        setAuthenticatedWalletAddress(accountInstance.address);
        setShowConnectDialog(true);
        return;
      }

      // No SIWE: skip ConnectDialog and approve immediately in app-specific mode
      onApprove({
        accounts: [{ address: accountInstance.address }],
      });
    } catch (error) {
      console.error('Login failed:', error);
      setLoggingInAccount(null);
    }
  };

  // Handle importing an existing passkey from cloud
  const handleImportAccount = async () => {
    try {
      if (!apiKey) {
        throw new Error('API key is required');
      }
      setIsImporting(true);

      // Use Account.import which handles everything
      const accountInstance = await Account.import({
        chainId: targetChainId,
        apiKey,
        paymasterUrl: paymasters?.[targetChainId]?.url,
      });

      const metadata = accountInstance.getMetadata();

      // If silent mode, skip ConnectDialog and approve immediately
      if (request.data.silent) {
        console.log('🔇 Silent mode: skipping connect confirmation');
        setIsImporting(false);
        onApprove({
          accounts: [{ address: accountInstance.address }],
        });
        return;
      }

      // If SIWE is requested, show ConnectDialog for confirmation
      if (signInWithEthereumCapability) {
        setAuthenticatedAccountName(metadata?.username || 'Imported Account');
        setAuthenticatedWalletAddress(accountInstance.address);
        setShowConnectDialog(true);
        setIsImporting(false);
        return;
      }

      // No SIWE: skip ConnectDialog and approve immediately in app-specific mode
      setIsImporting(false);
      onApprove({
        accounts: [{ address: accountInstance.address }],
      });
    } catch (error) {
      console.error('Import failed:', error);
      setIsImporting(false);
    }
  };

  // Handle creating a new account
  const handleCreateAccount = async (username: string): Promise<CreatedAccountData> => {
    try {
      if (!apiKey) {
        throw new Error('API key is required');
      }
      setIsCreating(true);

      // Get chainId from request or default
      const createChainId = request.data.chainId || defaultChainId || 1;

      // Construct full subname when ENS is enabled (e.g., "john.example.eth")
      const fullUsername = ensDomain ? `${username.trim()}.${ensDomain}` : username.trim();

      // Use Account.create which handles everything
      const accountInstance = await Account.create(
        {
          chainId: createChainId,
          apiKey,
          paymasterUrl: paymasters?.[createChainId]?.url,
        },
        {
          username: fullUsername,
          rpId,
          rpName,
        }
      );

      // Get full account data including credentialId and publicKey from stored accounts
      const storedAccounts = Account.getStoredAccounts(apiKey);
      const createdAccount = storedAccounts.find(acc => acc.username === fullUsername);

      if (!createdAccount) {
        throw new Error('Failed to retrieve created account data');
      }

      // Return full account data - OnboardingDialog will pass it to onAccountCreationComplete
      return {
        address: accountInstance.address,
        credentialId: createdAccount.credentialId,
        username: fullUsername,
        publicKey: createdAccount.publicKey,
      };
    } catch (error) {
      console.error('Account creation failed:', error);
      setIsCreating(false);
      throw error;
    }
  };

  // Handle account creation completion (after subname registration if applicable)
  // Account data flows through from onCreateAccount - no intermediate state needed
  const handleAccountCreationComplete = async (accountData: CreatedAccountData) => {
    // If silent mode, skip ConnectDialog and approve immediately
    if (request.data.silent) {
      console.log('🔇 Silent mode: skipping connect confirmation');
      setIsCreating(false);
      onApprove({
        accounts: [{ address: accountData.address }],
      });
      return;
    }

    // If SIWE is requested, show ConnectDialog for confirmation
    if (signInWithEthereumCapability) {
      setAuthenticatedAccountName(accountData.username || 'New Account');
      setAuthenticatedWalletAddress(accountData.address);
      setShowConnectDialog(true);
      setIsCreating(false);
      return;
    }

    // No SIWE: skip ConnectDialog and approve immediately in app-specific mode
    setIsCreating(false);
    onApprove({
      accounts: [{ address: accountData.address }],
    });
  };

  // Get config from request - capabilities is Record<string, unknown>
  const ensDomain = ens as string | undefined;
  console.log('🔗 ENS domain:', ensDomain);
  const chainId = request.data.chainId || defaultChainId || 1;
  const subnameTextRecords = request.data.capabilities?.subnameTextRecords as SubnameTextRecordCapabilityRequest | undefined;

  // Extract signInWithEthereum capability if present
  const signInWithEthereumCapability = request.data.capabilities?.signInWithEthereum as SignInWithEthereumCapabilityRequest | undefined;

  // Build SIWE message from capability if present
  const siweMessage = useMemo(() => {
    if (!signInWithEthereumCapability || !authenticatedWalletAddress) return null;

    try {
      // Extract domain and URI from origin
      let defaultDomain: string;
      let defaultUri: string;

      try {
        const url = new URL(origin);
        defaultDomain = url.host;
        defaultUri = origin;
      } catch {
        defaultDomain = origin;
        defaultUri = origin;
      }

      // Convert hex chainId to number
      const chainIdNumber = ensureIntNumber(signInWithEthereumCapability.chainId);

      return createSiweMessage({
        address: authenticatedWalletAddress as `0x${string}`,
        chainId: chainIdNumber,
        domain: signInWithEthereumCapability.domain || defaultDomain,
        nonce: signInWithEthereumCapability.nonce,
        uri: signInWithEthereumCapability.uri || defaultUri,
        version: '1',
        statement: signInWithEthereumCapability.statement,
        issuedAt: signInWithEthereumCapability.issuedAt ? new Date(signInWithEthereumCapability.issuedAt) : new Date(),
        expirationTime: signInWithEthereumCapability.expirationTime ? new Date(signInWithEthereumCapability.expirationTime) : undefined,
        notBefore: signInWithEthereumCapability.notBefore ? new Date(signInWithEthereumCapability.notBefore) : undefined,
        requestId: signInWithEthereumCapability.requestId,
        resources: signInWithEthereumCapability.resources,
      });
    } catch (error) {
      console.error('Failed to build SIWE message:', error);
      return null;
    }
  }, [signInWithEthereumCapability, authenticatedWalletAddress, origin]);

  // Handle SIWE sign action
  const handleSiweSign = async () => {
    if (!authenticatedWalletAddress || !siweMessage) return;

    setIsSiweSigning(true);
    setSiweStatus('Signing message...');

    try {
      // Restore account for signing
      const account = await getAccountForSigning(
        apiKey,
        targetChainId,
        paymasters?.[targetChainId]?.url
      );

      // Sign the SIWE message
      const signature = await account.signMessage(siweMessage);

      setSiweStatus('Sign-in successful!');
      console.log('🔗 User signed SIWE message');

      // Build response per ERC-7846 format with SIWE capability
      onApprove({
        accounts: [{
          address: authenticatedWalletAddress,
          capabilities: {
            signInWithEthereum: {
              message: siweMessage,
              signature: signature as `0x${string}`
            }
          }
        }]
      });
    } catch (error) {
      console.error('SIWE signature failed:', error);
      setSiweStatus(`Error: ${(error as Error).message}`);
      setIsSiweSigning(false);
    }
  };

  // Handle SIWE cancel
  const handleSiweCancel = () => {
    if (!isSiweSigning) {
      setShowConnectDialog(false);
      setAuthenticatedAccountName(null);
      setAuthenticatedWalletAddress(null);
      setLoggingInAccount(null);
      setSiweStatus('');
      // Return to account selection
    }
  };

  // If showing confirmation dialog and SIWE capability is present, show SiweDialog
  // Note: We check signInWithEthereumCapability first, then siweMessage will be computed
  if (showConnectDialog && authenticatedWalletAddress && signInWithEthereumCapability) {
    // siweMessage should be available since authenticatedWalletAddress is set
    if (!siweMessage) {
      // This shouldn't happen normally, but if SIWE message couldn't be built, fall through to ConnectDialog
      console.error('SIWE capability present but message could not be built');
    } else {
      return (
        <SiweDialog
          open={true}
          onOpenChange={(newOpen) => {
            if (!newOpen) handleSiweCancel();
          }}
          message={siweMessage}
          origin={origin}
          timestamp={new Date()}
          appName={request.data.appName || 'dApp'}
          appLogoUrl={request.data.appLogoUrl ?? undefined}
          accountAddress={authenticatedWalletAddress}
          chainName={chainName}
          chainId={targetChainId}
          chainIcon={chainIcon}
          mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
          onSign={handleSiweSign}
          onCancel={handleSiweCancel}
          isProcessing={isSiweSigning}
          siweStatus={siweStatus}
          canSign={!isSiweSigning}
        />
      );
    }
  }

  // If showing ConnectDialog confirmation (no SIWE), render that instead
  if (showConnectDialog && authenticatedWalletAddress) {
    return (
      <ConnectDialog
        open={true}
        onOpenChange={(newOpen) => {
          if (!newOpen) handleConnectCancel();
        }}
        appName={request.data.appName || 'dApp'}
        appLogoUrl={request.data.appLogoUrl ?? undefined}
        origin={origin}
        timestamp={new Date()}
        accountName={authenticatedAccountName || 'Account'}
        walletAddress={authenticatedWalletAddress}
        chainName={chainName}
        chainId={targetChainId}
        chainIcon={chainIcon}
        mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
        onConnect={async () => handleConnectConfirm()}
        onCancel={handleConnectCancel}
        showPermissions={false}
        isProcessing={isConnecting}
      />
    );
  }

  return (
    <DefaultDialogComponent
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      contentStyle={{
        width: 'fit-content',
        maxWidth: '450px',
      }}
    >
      <OnboardingDialog
        accounts={accounts}
        onAccountSelect={handleAccountSelect}
        loggingInAccount={loggingInAccount}
        onImportAccount={handleImportAccount}
        isImporting={isImporting}
        onCreateAccount={handleCreateAccount}
        onAccountCreationComplete={handleAccountCreationComplete}
        isCreating={isCreating}
        ensDomain={ensDomain}
        chainId={chainId}
        mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
        apiKey={apiKey}
        supportedChains={SUPPORTED_CHAINS.map(chain => ({ id: chain.id }))}
        subnameTextRecords={subnameTextRecords}
      />
    </DefaultDialogComponent>
  );
}

function SignatureDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: SignatureUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;
  const chainName = getChainNameFromId(chainId);
  const chainIcon = useChainIconURI(chainId, apiKey, 24);

  const handleSign = async () => {
    setIsProcessing(true);
    setSignatureStatus('Signing message...');
    try {
      // Restore account for signing
      const account = await getAccountForSigning(
        apiKey,
        chainId,
        paymasters?.[chainId]?.url
      );

      // Sign the message
      const signature = await account.signMessage(request.data.message);

      setSignatureStatus('Signature successful!');
      onApprove(signature);
    } catch (error) {
      console.error('Signature failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setSignatureStatus(`Error: ${errorObj.message}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorObj.message));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <SignatureDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      message={request.data.message}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      timestamp={new Date(request.timestamp)}
      accountAddress={request.data.address}
      chainName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={!isProcessing && !!request.data.message}
    />
  );
}

function Eip712DialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: TypedDataUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;

  const handleSign = async () => {
    setIsProcessing(true);
    setSignatureStatus('Signing typed data...');
    try {
      // Restore account for signing
      const account = await getAccountForSigning(
        apiKey,
        chainId,
        paymasters?.[chainId]?.url
      );

      // Parse typed data if it's a string
      const typedData = typeof request.data.typedData === 'string'
        ? JSON.parse(request.data.typedData)
        : request.data.typedData;

      // Sign the typed data
      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      setSignatureStatus('Signature successful!');
      onApprove(signature);
    } catch (error) {
      console.error('EIP-712 signature failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setSignatureStatus(`Error: ${errorObj.message}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorObj.message));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <Eip712Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      typedDataJson={request.data.typedData}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      timestamp={new Date(request.timestamp)}
      accountAddress={request.data.address}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={true}
    />
  );
}

function TransactionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: TransactionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  // Fee token state for ERC-20 paymaster
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(false);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find(t => t.isNative);
  const nativeSymbol = nativeToken?.symbol || viemChain?.nativeCurrency?.symbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > paymasters[chainId].url
  const effectivePaymasterUrl = useMemo(() => {
    const capabilitiesPaymasterUrl = request.data.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || paymasters?.[chainId]?.url;
  }, [request.data.capabilities?.paymasterService?.url, paymasters, chainId]);

  // Extract paymasterContext from capabilities (for ERC-20 token payments, mode flags, etc.)
  // Priority: capabilities.paymasterService.context > paymasters[chainId].context
  const effectivePaymasterContext = useMemo(() => {
    const capabilitiesPaymasterContext = (request.data.capabilities?.paymasterService as { context?: Record<string, unknown> } | undefined)?.context;
    return capabilitiesPaymasterContext || paymasters?.[chainId]?.context;
  }, [request.data.capabilities?.paymasterService, paymasters, chainId]);

  const isSponsored = !!effectivePaymasterUrl;

  // Transform calls to transactions format expected by dialog
  const transactions = useMemo(() => request.data.calls.map(call => ({
    to: call.to,
    data: call.data,
    value: call.value,
    chainId: request.data.chainId,
  })), [request.data.calls, request.data.chainId]);

  // Convert transactions to call format for Account operations
  const transactionCalls = useMemo(() => {
    return request.data.calls.map(call => ({
      to: call.to as Address,
      value: call.value ? BigInt(call.value) : undefined, // Convert string wei to bigint
      data: (call.data || '0x') as Hex,
    }));
  }, [request.data.calls]);

  // Permission ID for permission-based execution
  const permissionId = request.data.capabilities?.permissions?.id as Hex | undefined;

  // Use gas estimation hook for parallel ETH and ERC-20 estimation
  const {
    gasFee,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
  } = useGasEstimation({
    account,
    transactionCalls,
    chainId,
    apiKey,
    feeTokens,
    isSponsored,
    permissionId,
    onFeeTokensUpdate: setFeeTokens,
  });

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chainId, apiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address and gas amount in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      // Use the actual estimate from tokenEstimates if available
      const estimate = tokenEstimates.find(
        e => e.tokenAddress.toLowerCase() === selectedFeeToken.address.toLowerCase()
      );

      if (estimate) {
        // Use the actual token cost from paymaster quote
        return {
          token: selectedFeeToken.address,
          gas: estimate.tokenCost.toString(),
        };
      }

      // Fallback to client-side calculation if no estimate yet
      const gasUsd = gasFee && nativeTokenPrice ? nativeTokenPrice * Number(gasFee) : 0;
      const gasInTokenUnits = Math.ceil(gasUsd * Math.pow(10, selectedFeeToken.decimals));
      return {
        token: selectedFeeToken.address,
        gas: gasInTokenUnits.toString(),
      };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext, gasFee, nativeTokenPrice, tokenEstimates]);

  // Fetch fee tokens when not sponsored (for ERC-20 paymaster option)
  useEffect(() => {
    // Skip if already sponsored via capabilities or config
    if (effectivePaymasterUrl) return;

    let isMounted = true;

    const fetchFeeTokensData = async () => {
      setFeeTokensLoading(true);
      try {
        // Fetch capabilities from JAW RPC
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          apiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chainId.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0] || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, request.data.from, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const isNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = isNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative,
                isSelectable,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            } catch (error) {
              console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: 0n,
                balanceFormatted: '0',
                isNative: isNativeToken(token.address),
                isSelectable: false,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Note: Initial token selection is handled by useGasEstimation hook
        }
      } catch (error) {
        console.warn('[TransactionDialogWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, request.data.from, effectivePaymasterUrl, viemChain]);

  // Initialize account
  // Note: Use effectivePaymasterUrl (stable) instead of computedPaymasterUrl to avoid
  // re-initializing account when user changes fee token selection (which would cause
  // gas estimation to run multiple times in a dependency cycle)
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await getAccountForSigning(
          apiKey,
          chainId,
          effectivePaymasterUrl
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('Error initializing account:', error);
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, effectivePaymasterUrl]);

  // Note: Gas estimation is now handled by useGasEstimation hook

  const handleConfirm = async () => {
    setIsProcessing(true);
    setTransactionStatus('Processing transaction...');
    try {
      if (!account) {
        throw new Error('Account not initialized');
      }

      // Check if permissions capability is provided
      const permissionId = request.data.capabilities?.permissions?.id;

      const result = await account.sendCalls(
        transactionCalls,
        permissionId ? { permissionId } : undefined,
        computedPaymasterUrl,
        computedPaymasterContext
      );

      setTransactionStatus('Transaction successful!');
      onApprove({
        id: result.id,
        chainId: result.chainId,
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorMessage = errorObj.message;
      setTransactionStatus(`Error: ${errorMessage}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else if (
        errorMessage.includes('AA21') ||
        errorMessage.includes("didn't pay prefund") ||
        errorMessage.includes('insufficient') ||
        errorMessage.includes('exceeds balance')
      ) {
        // Transaction rejected due to funds/gas issues
        onReject(new UIError(standardErrorCodes.rpc.transactionRejected as UIErrorCode, errorMessage));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorMessage));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  // Determine if fee token selector should be shown (not sponsored and has ERC-20 options)
  const showFeeTokenSelector = !isSponsored && feeTokens.some(t => !t.isNative);

  return (
    <TransactionDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      transactions={transactions}
      walletAddress={request.data.from}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus={transactionStatus}
      networkName={networkName}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      apiKey={apiKey}
      // Fee token props for ERC-20 paymaster
      feeTokens={feeTokens}
      feeTokensLoading={feeTokensLoading}
      selectedFeeToken={selectedFeeToken}
      onFeeTokenSelect={setSelectedFeeToken}
      showFeeTokenSelector={showFeeTokenSelector}
      isPayingWithErc20={isPayingWithErc20}
      nativeCurrencySymbol={viemChain?.nativeCurrency?.symbol}
    />
  );
}

// SendTransactionDialogWrapper - handles eth_sendTransaction (legacy single transaction)
function SendTransactionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: SendTransactionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  // Fee token state for ERC-20 paymaster
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(false);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find(t => t.isNative);
  const nativeSymbol = nativeToken?.symbol || viemChain?.nativeCurrency?.symbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > paymasters[chainId].url
  const effectivePaymasterUrl = useMemo(() => {
    const capabilitiesPaymasterUrl = request.data.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || paymasters?.[chainId]?.url;
  }, [request.data.capabilities?.paymasterService?.url, paymasters, chainId]);

  // Extract paymasterContext from capabilities (for ERC-20 token payments, mode flags, etc.)
  // Priority: capabilities.paymasterService.context > paymasters[chainId].context
  const effectivePaymasterContext = useMemo(() => {
    const capabilitiesPaymasterContext = (request.data.capabilities?.paymasterService as { context?: Record<string, unknown> } | undefined)?.context;
    return capabilitiesPaymasterContext || paymasters?.[chainId]?.context;
  }, [request.data.capabilities?.paymasterService, paymasters, chainId]);

  const isSponsored = !!effectivePaymasterUrl;

  // Transform eth_sendTransaction data to transactions format expected by dialog
  const transactions = useMemo(() => [{
    to: request.data.to,
    data: request.data.data,
    value: request.data.value,
    chainId: request.data.chainId,
  }], [request.data]);

  // Convert to call format for Account operations
  const transactionCalls = useMemo(() => [{
    to: request.data.to as Address,
    value: request.data.value ? BigInt(request.data.value) : undefined, // Convert string wei to bigint
    data: (request.data.data || '0x') as Hex,
  }], [request.data]);

  // Use gas estimation hook for parallel ETH and ERC-20 estimation
  const {
    gasFee,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
  } = useGasEstimation({
    account,
    transactionCalls,
    chainId,
    apiKey,
    feeTokens,
    isSponsored,
    onFeeTokensUpdate: setFeeTokens,
  });

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chainId, apiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address and gas amount in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      // Use the actual estimate from tokenEstimates if available
      const estimate = tokenEstimates.find(
        e => e.tokenAddress.toLowerCase() === selectedFeeToken.address.toLowerCase()
      );

      if (estimate) {
        // Use the actual token cost from paymaster quote
        return {
          token: selectedFeeToken.address,
          gas: estimate.tokenCost.toString(),
        };
      }

      // Fallback to client-side calculation if no estimate yet
      const gasUsd = gasFee && nativeTokenPrice ? nativeTokenPrice * Number(gasFee) : 0;
      const gasInTokenUnits = Math.ceil(gasUsd * Math.pow(10, selectedFeeToken.decimals));
      return {
        token: selectedFeeToken.address,
        gas: gasInTokenUnits.toString(),
      };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext, gasFee, nativeTokenPrice, tokenEstimates]);

  // Fetch fee tokens when not sponsored (for ERC-20 paymaster option)
  useEffect(() => {
    // Skip if already sponsored via capabilities or config
    if (effectivePaymasterUrl) return;

    let isMounted = true;

    const fetchFeeTokensData = async () => {
      setFeeTokensLoading(true);
      try {
        // Fetch capabilities from JAW RPC
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          apiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chainId.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0] || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, request.data.from, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const isNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = isNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative,
                isSelectable,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            } catch (error) {
              console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: 0n,
                balanceFormatted: '0',
                isNative: isNativeToken(token.address),
                isSelectable: false,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Note: Initial token selection is handled by useGasEstimation hook
        }
      } catch (error) {
        console.warn('[SendTransactionDialogWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, request.data.from, effectivePaymasterUrl, viemChain]);

  // Initialize account
  // Note: Use effectivePaymasterUrl (stable) instead of computedPaymasterUrl to avoid
  // re-initializing account when user changes fee token selection (which would cause
  // gas estimation to run multiple times in a dependency cycle)
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await getAccountForSigning(
          apiKey,
          chainId,
          effectivePaymasterUrl
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('Error initializing account:', error);
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, effectivePaymasterUrl]);

  // Note: Gas estimation is now handled by useGasEstimation hook

  const handleConfirm = async () => {
    setIsProcessing(true);
    setTransactionStatus('Processing transaction...');
    try {
      if (!account) {
        throw new Error('Account not initialized');
      }

      const txHash = await account.sendTransaction(transactionCalls, computedPaymasterUrl, computedPaymasterContext);

      setTransactionStatus('Transaction successful!');
      onApprove(txHash);
    } catch (error) {
      console.error('Transaction failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorMessage = errorObj.message;
      setTransactionStatus(`Error: ${errorMessage}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else if (
        errorMessage.includes('AA21') ||
        errorMessage.includes("didn't pay prefund") ||
        errorMessage.includes('insufficient') ||
        errorMessage.includes('exceeds balance')
      ) {
        // Transaction rejected due to funds/gas issues
        onReject(new UIError(standardErrorCodes.rpc.transactionRejected as UIErrorCode, errorMessage));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorMessage));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  // Determine if fee token selector should be shown (not sponsored and has ERC-20 options)
  const showFeeTokenSelector = !isSponsored && feeTokens.some(t => !t.isNative);

  return (
    <TransactionDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      transactions={transactions}
      walletAddress={request.data.from}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus={transactionStatus}
      networkName={networkName}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      apiKey={apiKey}
      // Fee token props for ERC-20 paymaster
      feeTokens={feeTokens}
      feeTokensLoading={feeTokensLoading}
      selectedFeeToken={selectedFeeToken}
      onFeeTokenSelect={setSelectedFeeToken}
      showFeeTokenSelector={showFeeTokenSelector}
      isPayingWithErc20={isPayingWithErc20}
      nativeCurrencySymbol={viemChain?.nativeCurrency?.symbol}
    />
  );
}

// Known function selectors mapping
const KNOWN_FUNCTION_SELECTORS: Record<string, string> = {
  '0x32323232': 'Any Function',
  '0xe0e0e0e0': 'Empty Calldata',
  '0xcc53287f': 'lockdown((address,address)[])',
  '0x87517c45': 'approve(address,address,uint160,uint48)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0xa9059cbb': 'transfer(address,uint256)',
};

// Resolve function selector to human-readable name
const resolveFunctionSelector = (selector: string): string => {
  const normalizedSelector = selector.toLowerCase();
  const knownName = KNOWN_FUNCTION_SELECTORS[normalizedSelector];
  return knownName || selector;
};

function PermissionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: PermissionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(true);

  // chainId can be number or hex string (like '0x1')
  const requestChainId = request.data.chainId;
  const chainId = typeof requestChainId === 'string'
    ? parseInt(requestChainId, requestChainId.startsWith('0x') ? 16 : 10)
    : (requestChainId || defaultChainId || 1);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find(t => t.isNative);
  const nativeSymbol = nativeToken?.symbol || viemChain?.nativeCurrency?.symbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > paymasters[chainId].url
  const effectivePaymasterUrl = useMemo(() => {
    const capabilitiesPaymasterUrl = request.data.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || paymasters?.[chainId]?.url;
  }, [request.data.capabilities?.paymasterService?.url, paymasters, chainId]);

  // Extract paymasterContext from capabilities (for ERC-20 token payments, mode flags, etc.)
  // Priority: capabilities.paymasterService.context > paymasters[chainId].context
  const effectivePaymasterContext = useMemo(() => {
    const capabilitiesPaymasterContext = (request.data.capabilities?.paymasterService as { context?: Record<string, unknown> } | undefined)?.context;
    return capabilitiesPaymasterContext || paymasters?.[chainId]?.context;
  }, [request.data.capabilities?.paymasterService, paymasters, chainId]);

  // Check if this is a sponsored transaction (paymaster provided)
  const isSponsored = !!effectivePaymasterUrl;

  // Build the actual permission grant call for gas estimation
  // This uses the real approve() call data to PERMISSIONS_MANAGER_ADDRESS
  const transactionCalls = useMemo(() => {
    // Need account address to build the call - will be empty until account is initialized
    if (!request.data.address) return [];

    try {
      const permissionCall = buildGrantPermissionCall(
        request.data.address as Address,
        request.data.spender as Address,
        request.data.expiry,
        request.data.permissions
      );
      return [permissionCall];
    } catch (error) {
      console.warn('[PermissionDialogWrapper] Failed to build permission grant call:', error);
      return [];
    }
  }, [request.data.address, request.data.spender, request.data.expiry, request.data.permissions]);

  // Use the gas estimation hook for both ETH and ERC-20 cost estimation
  const {
    gasFee,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
  } = useGasEstimation({
    account,
    transactionCalls,
    chainId,
    apiKey,
    feeTokens,
    isSponsored,
    onFeeTokensUpdate: setFeeTokens,
  });

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chainId, apiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address and gas amount in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      // Use the actual estimate from tokenEstimates if available
      const estimate = tokenEstimates.find(
        e => e.tokenAddress.toLowerCase() === selectedFeeToken.address.toLowerCase()
      );

      if (estimate) {
        // Use the actual token cost from paymaster quote
        return {
          token: selectedFeeToken.address,
          gas: estimate.tokenCost.toString(),
        };
      }

      // Fallback to client-side calculation if no estimate yet
      const gasUsd = gasFee && nativeTokenPrice ? nativeTokenPrice * Number(gasFee) : 0;
      const gasInTokenUnits = Math.ceil(gasUsd * Math.pow(10, selectedFeeToken.decimals));
      return {
        token: selectedFeeToken.address,
        gas: gasInTokenUnits.toString(),
      };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext, tokenEstimates, gasFee, nativeTokenPrice]);

  const chain = useMemo(
    () => buildChainConfigFromApiKey(chainId, apiKey, computedPaymasterUrl),
    [chainId, apiKey, computedPaymasterUrl]
  );

  // Get spends array from request (now using spends plural)
  const spendsData = request.data.permissions.spends || [];

  // Get calls array from request
  const callsData = request.data.permissions.calls || [];

  // Fetch token info for all unique tokens in spends
  useEffect(() => {
    if (spendsData.length === 0) {
      setIsLoadingTokenInfo(false);
      return;
    }

    let isMounted = true;
    setIsLoadingTokenInfo(true);

    const fetchAllTokenInfo = async () => {
      const newTokenInfoMap: TokenInfoMap = {};

      // Get unique token addresses
      const uniqueTokens = Array.from(new Set(spendsData.map((spend) => spend.token))) as string[];

      for (const tokenAddress of uniqueTokens) {
        // Skip if already fetched
        if (tokenInfoMap[tokenAddress]) {
          newTokenInfoMap[tokenAddress] = tokenInfoMap[tokenAddress];
          continue;
        }

        // If native token, use chain's native currency
        if (isNativeToken(tokenAddress)) {
          newTokenInfoMap[tokenAddress] = {
            decimals: viemChain?.nativeCurrency?.decimals ?? 18,
            symbol: viemChain?.nativeCurrency?.symbol || 'ETH'
          };
          continue;
        }

        // Fetch ERC-20 token info
        try {
          const publicClient = createPublicClient({
            chain: {
              id: chainId,
              name: networkName,
              nativeCurrency: viemChain?.nativeCurrency || { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: {
                default: { http: [chain.rpcUrl || ''] },
                public: { http: [chain.rpcUrl || ''] },
              },
            },
            transport: http(chain.rpcUrl),
          });

          const [decimals, symbol] = await Promise.all([
            publicClient.readContract({
              address: tokenAddress as Address,
              abi: erc20Abi,
              functionName: 'decimals',
            }),
            publicClient.readContract({
              address: tokenAddress as Address,
              abi: erc20Abi,
              functionName: 'symbol',
            }),
          ]);

          newTokenInfoMap[tokenAddress] = { decimals, symbol };
        } catch (error) {
          console.error(`Failed to fetch token info for ${tokenAddress}:`, error);
          // Fallback to showing truncated token address
          newTokenInfoMap[tokenAddress] = {
            decimals: 18,
            symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
          };
        }
      }

      if (isMounted) {
        setTokenInfoMap(prev => ({ ...prev, ...newTokenInfoMap }));
        setIsLoadingTokenInfo(false);
      }
    };

    fetchAllTokenInfo();

    return () => {
      isMounted = false;
    };
  }, [chainId, spendsData, networkName, chain.rpcUrl, viemChain]);

  // Fetch fee tokens from capabilities (same pattern as TransactionDialogWrapper)
  useEffect(() => {
    let isMounted = true;

    const fetchFeeTokensData = async () => {
      if (!viemChain || !apiKey) {
        setFeeTokensLoading(false);
        return;
      }

      // If sponsored, no need to fetch fee tokens
      if (effectivePaymasterUrl) {
        setFeeTokensLoading(false);
        return;
      }

      try {
        setFeeTokensLoading(true);

        // Fetch capabilities from JAW RPC
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          apiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chainId.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0] || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, request.data.address, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const tokenIsNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = tokenIsNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative: tokenIsNative,
                isSelectable,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            } catch (error) {
              console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: 0n,
                balanceFormatted: '0',
                isNative: isNativeToken(token.address),
                isSelectable: false,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Note: Initial token selection is handled by useGasEstimation hook
        }
      } catch (error) {
        console.warn('[PermissionDialogWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, request.data.address, effectivePaymasterUrl, viemChain]);

  // Initialize account
  // Note: Use effectivePaymasterUrl (stable) instead of computedPaymasterUrl to avoid
  // re-initializing account when user changes fee token selection (which would cause
  // gas estimation to run multiple times in a dependency cycle)
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await getAccountForSigning(
          apiKey,
          chainId,
          effectivePaymasterUrl
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('[PermissionDialogWrapper] Error initializing account:', error);
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, effectivePaymasterUrl]);

  // Note: Gas estimation is now handled by useGasEstimation hook

  // Convert to SpendPermission array format expected by PermissionDialog
  const spends = useMemo(() => spendsData.map(spend => {
    const tokenInfo = tokenInfoMap[spend.token] || (isNativeToken(spend.token)
      ? { decimals: viemChain?.nativeCurrency?.decimals ?? 18, symbol: nativeSymbol }
      : { decimals: 18, symbol: spend.token.slice(0, 6) + '...' + spend.token.slice(-4) });

    const allowance = BigInt(spend.allowance);
    const amount = formatUnits(allowance, tokenInfo.decimals);
    const limit = `${amount} ${tokenInfo.symbol}`;

    // Format duration with multiplier (defaults to 1 if not provided)
    const multiplier = spend.multiplier ?? 1;
    const duration = `${multiplier} ${spend.unit}${multiplier > 1 ? 's' : ''}`;

    return {
      amount,
      token: isNativeToken(spend.token) ? `Native (${nativeSymbol})` : tokenInfo.symbol,
      tokenAddress: spend.token,
      duration,
      limit,
    };
  }), [spendsData, tokenInfoMap, viemChain, nativeSymbol]);

  // Format call permissions
  const calls = useMemo(() => callsData.map(call => ({
    target: call.target,
    selector: call.selector,
    functionSignature: call.functionSignature || (call.selector ? resolveFunctionSelector(call.selector) : 'Unknown Function'),
  })), [callsData]);

  // Format expiry date
  const expiryDate = useMemo(() => {
    return formatExpiryDate(request.data.expiry);
  }, [request.data.expiry]);

  // Generate warning message based on actual permissions
  const warningMessage = useMemo(() => {
    const parts: string[] = [];

    // Describe spend permissions
    if (spends.length > 0) {
      const spendDescriptions = spends.map(spend => {
        // Remove "1 " prefix from duration (e.g., "1 Day" -> "day", "1 Week" -> "week")
        const normalizedDuration = spend.duration.replace(/^1\s+/, '').toLowerCase();
        // Handle "forever" specially - no "per" prefix needed
        if (normalizedDuration === 'forever') {
          return spend.limit;
        }
        return `${spend.limit} per ${normalizedDuration}`;
      });
      parts.push(`spend up to ${spendDescriptions.join(', ')}`);
    }

    // Describe call permissions
    if (calls.length > 0) {
      const callDescriptions = calls.map(call => {
        const fnName = call.functionSignature;
        // Check for special selectors
        if (fnName === 'Any Function') {
          return 'call any function';
        }
        if (fnName === 'Empty Calldata') {
          return 'send transactions with empty calldata';
        }
        // Extract just the function name from signature like "transfer(address,uint256)"
        const simpleName = fnName.split('(')[0];
        return `call ${simpleName}`;
      });

      // Deduplicate and join
      const uniqueCalls = [...new Set(callDescriptions)];
      parts.push(uniqueCalls.join(', '));
    }

    if (parts.length === 0) {
      return `You are granting permissions to this dApp until ${expiryDate}. Only approve if you trust this dApp.`;
    }

    return `This will allow the dApp to ${parts.join(' and ')} on your behalf until ${expiryDate}. Only approve if you trust this dApp.`;
  }, [spends, calls, expiryDate]);

  const handleConfirm = async () => {
    if (!account) {
      console.error('[PermissionDialogWrapper] Account not initialized');
      return;
    }

    setIsProcessing(true);
    setStatus('Granting permissions...');
    try {
      // Use the spends array directly from the request (already in correct format)
      const permissionsDetail = {
        spends: request.data.permissions.spends || [],
        calls: request.data.permissions.calls,
      };

      // Grant permissions using Account class with paymaster context
      const result = await account.grantPermissions(
        request.data.expiry,
        request.data.spender as Address,
        permissionsDetail,
        computedPaymasterUrl,
        computedPaymasterContext
      );

      setStatus('Permissions granted successfully!');
      onApprove(result);
    } catch (error) {
      console.error('Permission grant failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setStatus(`Error: ${errorObj.message}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorObj.message));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <PermissionDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      mode="grant"
      spenderAddress={request.data.spender}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      spends={spends}
      calls={calls}
      expiryDate={expiryDate}
      networkName={networkName}
      chainId={chainId}
      apiKey={apiKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
      isLoadingTokenInfo={isLoadingTokenInfo}
      timestamp={new Date(request.timestamp)}
      warningMessage={warningMessage}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      // Fee token props for ERC-20 paymaster
      feeTokens={feeTokens}
      feeTokensLoading={feeTokensLoading}
      selectedFeeToken={selectedFeeToken}
      onFeeTokenSelect={setSelectedFeeToken}
      showFeeTokenSelector={!isSponsored && feeTokens.some(t => !t.isNative)}
      isPayingWithErc20={isPayingWithErc20}
      nativeCurrencySymbol={viemChain?.nativeCurrency?.symbol}
    />
  );
}

// SiweDialogWrapper - handles Sign-In with Ethereum messages
function SiweDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: SignatureUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [siweStatus, setSiweStatus] = useState<string>('');

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;
  const chainName = getChainNameFromId(chainId);
  const chainIcon = useChainIconURI(chainId, apiKey, 24);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  // Decode message if it's hex encoded
  const decodedMessage = useMemo(() => {
    const msg = request.data.message;
    if (msg.startsWith('0x')) {
      try {
        return hexToUtf8(msg);
      } catch {
        return msg;
      }
    }
    return msg;
  }, [request.data.message]);

  // Extract app name from SIWE message
  const appName = useMemo(() => {
    const match = decodedMessage.match(/^([^\n]+)\s+wants you to sign in/);
    return match ? match[1] : 'dApp';
  }, [decodedMessage]);

  // Generate warning if URI in SIWE message doesn't match current origin
  const warningMessage = useMemo(() => {
    try {
      // Extract URI from SIWE message
      const uriMatch = decodedMessage.match(/URI:\s*(.+)/);
      if (!uriMatch) return undefined;

      const siweUri = uriMatch[1].trim();
      const siweOrigin = new URL(siweUri).origin;
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

      if (siweOrigin !== currentOrigin) {
        return `The sign-in request is for "${siweUri}" but you are currently on "${currentOrigin}". This may be a phishing attempt.`;
      }
    } catch {
      // If URI parsing fails, don't show warning
    }
    return undefined;
  }, [decodedMessage]);

  const handleSign = async () => {
    setIsProcessing(true);
    setSiweStatus('Signing message...');
    try {
      // Restore account for signing
      const account = await getAccountForSigning(
        apiKey,
        chainId,
        paymasters?.[chainId]?.url
      );

      // Sign the message
      const signature = await account.signMessage(request.data.message);

      setSiweStatus('Sign-in successful!');
      onApprove(signature);
    } catch (error) {
      console.error('SIWE signature failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setSiweStatus(`Error: ${errorObj.message}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorObj.message));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <SiweDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      message={decodedMessage}
      origin={origin}
      timestamp={new Date(request.timestamp)}
      appName={appName}
      accountAddress={request.data.address}
      chainName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      siweStatus={siweStatus}
      canSign={!isProcessing}
      warningMessage={warningMessage}
    />
  );
}

// RevokePermissionDialogWrapper - handles wallet_revokePermissions
function RevokePermissionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasters,
}: {
  request: RevokePermissionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasters?: Record<number, PaymasterConfig>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [isLoadingPermissionDetails, setIsLoadingPermissionDetails] = useState(true);
  const [fetchedPermissionData, setFetchedPermissionData] = useState<any>(null);
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});
  const [account, setAccount] = useState<Account | null>(null);
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(true);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';

  // Get native token symbol from feeTokens, falling back to chain's native currency
  const nativeToken = feeTokens?.find(t => t.isNative);
  const nativeSymbol = nativeToken?.symbol || viemChain?.nativeCurrency?.symbol || 'ETH';

  // Fetch native token price dynamically based on the chain's native token symbol
  const nativeTokenPrice = useFeeTokenPrice(nativeSymbol);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > paymasters[chainId].url
  const effectivePaymasterUrl = useMemo(() => {
    const capabilitiesPaymasterUrl = request.data.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || paymasters?.[chainId]?.url;
  }, [request.data.capabilities?.paymasterService?.url, paymasters, chainId]);

  // Extract paymasterContext from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.context > paymasters[chainId].context
  const effectivePaymasterContext = useMemo(() => {
    const capabilitiesPaymasterContext = (request.data.capabilities?.paymasterService as { context?: Record<string, unknown> } | undefined)?.context;
    return capabilitiesPaymasterContext || paymasters?.[chainId]?.context;
  }, [request.data.capabilities?.paymasterService, paymasters, chainId]);

  // Check if this is a sponsored transaction (paymaster provided)
  const isSponsored = !!effectivePaymasterUrl;

  // Build the actual permission revoke call for gas estimation
  const transactionCalls = useMemo(() => {
    if (!fetchedPermissionData) return [];

    try {
      const revokeCall = buildRevokePermissionCall(fetchedPermissionData);
      return [revokeCall];
    } catch (error) {
      console.warn('[RevokePermissionDialogWrapper] Failed to build permission revoke call:', error);
      return [];
    }
  }, [fetchedPermissionData]);

  // Use the gas estimation hook for both ETH and ERC-20 cost estimation
  const {
    gasFee,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
  } = useGasEstimation({
    account,
    transactionCalls,
    chainId,
    apiKey,
    feeTokens,
    isSponsored,
    onFeeTokensUpdate: setFeeTokens,
  });

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chainId, apiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address and gas amount in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      // Use the actual estimate from tokenEstimates if available
      const estimate = tokenEstimates.find(
        e => e.tokenAddress.toLowerCase() === selectedFeeToken.address.toLowerCase()
      );

      if (estimate) {
        // Use the actual token cost from paymaster quote
        return {
          token: selectedFeeToken.address,
          gas: estimate.tokenCost.toString(),
        };
      }

      // Fallback to client-side calculation if no estimate yet
      const gasUsd = gasFee && nativeTokenPrice ? nativeTokenPrice * Number(gasFee) : 0;
      const gasInTokenUnits = Math.ceil(gasUsd * Math.pow(10, selectedFeeToken.decimals));
      return {
        token: selectedFeeToken.address,
        gas: gasInTokenUnits.toString(),
      };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext, tokenEstimates, gasFee, nativeTokenPrice]);

  const chain = useMemo(
    () => buildChainConfigFromApiKey(chainId, apiKey, computedPaymasterUrl),
    [chainId, apiKey, computedPaymasterUrl]
  );

  // Fetch permission details from relay
  useEffect(() => {
    if (!request.data.permissionId || !apiKey) {
      setIsLoadingPermissionDetails(false);
      return;
    }

    const fetchPermissionDetails = async () => {
      try {
        const permData = await getPermissionFromRelay(request.data.permissionId as `0x${string}`, apiKey);
        console.log('✅ Fetched permission details from relay:', permData);
        setFetchedPermissionData(permData);

        // Fetch token info for spends
        if (permData.spends && permData.spends.length > 0) {
          const newTokenInfoMap: TokenInfoMap = {};
          for (const spend of permData.spends) {
            const tokenAddress = spend.token;
            if (isNativeToken(tokenAddress)) {
              newTokenInfoMap[tokenAddress] = {
                decimals: viemChain?.nativeCurrency?.decimals ?? 18,
                symbol: viemChain?.nativeCurrency?.symbol || 'ETH'
              };
            } else {
              try {
                const publicClient = createPublicClient({
                  chain: {
                    id: chainId,
                    name: networkName,
                    nativeCurrency: viemChain?.nativeCurrency || { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: {
                      default: { http: [chain.rpcUrl || ''] },
                      public: { http: [chain.rpcUrl || ''] },
                    },
                  },
                  transport: http(chain.rpcUrl),
                });

                const [decimals, symbol] = await Promise.all([
                  publicClient.readContract({
                    address: tokenAddress as Address,
                    abi: erc20Abi,
                    functionName: 'decimals',
                  }),
                  publicClient.readContract({
                    address: tokenAddress as Address,
                    abi: erc20Abi,
                    functionName: 'symbol',
                  }),
                ]);
                newTokenInfoMap[tokenAddress] = { decimals, symbol };
              } catch {
                newTokenInfoMap[tokenAddress] = { decimals: 18, symbol: tokenAddress };
              }
            }
          }
          setTokenInfoMap(newTokenInfoMap);
        }
        setIsLoadingPermissionDetails(false);
      } catch (error) {
        console.error('❌ Failed to fetch permission details:', error);
        setIsLoadingPermissionDetails(false);
      }
    };

    fetchPermissionDetails();
  }, [request.data.permissionId, apiKey, chainId, networkName, chain.rpcUrl, viemChain]);

  // Fetch fee tokens for ERC-20 paymaster support
  useEffect(() => {
    // Skip if already sponsored via capabilities/config
    if (effectivePaymasterUrl) {
      setFeeTokensLoading(false);
      return;
    }

    let isMounted = true;

    const fetchFeeTokensData = async () => {
      try {
        // Fetch capabilities to get available fee tokens
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          apiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chainId.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0] || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, request.data.address as Address, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const tokenIsNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = tokenIsNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative: tokenIsNative,
                isSelectable,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            } catch (error) {
              console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: 0n,
                balanceFormatted: '0',
                isNative: isNativeToken(token.address),
                isSelectable: false,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Note: Initial token selection is handled by useGasEstimation hook
        }
      } catch (error) {
        console.warn('[RevokePermissionDialogWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, request.data.address, effectivePaymasterUrl, viemChain]);

  // Initialize account
  // Note: Use effectivePaymasterUrl (stable) instead of computedPaymasterUrl to avoid
  // re-initializing account when user changes fee token selection (which would cause
  // gas estimation to run multiple times in a dependency cycle)
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await getAccountForSigning(
          apiKey,
          chainId,
          effectivePaymasterUrl
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('[RevokePermissionDialogWrapper] Error initializing account:', error);
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, effectivePaymasterUrl]);

  // Format spends for display
  const formattedSpends = useMemo(() => {
    if (!fetchedPermissionData?.spends) return [];

    return fetchedPermissionData.spends.map((spend: any) => {
      const tokenAddress = spend.token;
      const tokenInfo = tokenInfoMap[tokenAddress] || {
        decimals: viemChain?.nativeCurrency?.decimals ?? 18,
        symbol: nativeSymbol
      };
      const allowance = BigInt(spend.allowance);
      const amount = formatUnits(allowance, tokenInfo.decimals);
      const limit = `${amount} ${tokenInfo.symbol}`;
      // Format duration with multiplier (unit is period string like 'day', 'week', etc.)
      const multiplier = spend.multiplier ?? 1;
      const duration = `${multiplier} ${spend.unit}${multiplier > 1 ? 's' : ''}`;

      return {
        amount,
        token: isNativeToken(tokenAddress)
          ? `Native (${nativeSymbol})`
          : tokenInfo.symbol,
        tokenAddress,
        duration,
        limit,
      };
    });
  }, [fetchedPermissionData, tokenInfoMap, viemChain, nativeSymbol]);

  // Format call permissions from fetched data
  const formattedCalls = useMemo(() => {
    if (!fetchedPermissionData?.calls) return [];

    return fetchedPermissionData.calls.map((call: any) => ({
      target: call.target,
      selector: call.selector,
      functionSignature: call.functionSignature || (call.selector ? resolveFunctionSelector(call.selector) : 'Unknown Function'),
    }));
  }, [fetchedPermissionData]);

  // Expiry date from fetched permission
  const expiryDate = useMemo(() => {
    if (!fetchedPermissionData) return '';
    const endTimestamp = parseInt(fetchedPermissionData.end, 10);
    return formatExpiryDate(endTimestamp);
  }, [fetchedPermissionData]);

  // Spender address from fetched permission
  const spenderAddress = fetchedPermissionData?.spender || '0x...';

  const handleConfirm = async () => {
    if (!account) {
      console.error('[RevokePermissionDialogWrapper] Account not initialized');
      return;
    }

    setIsProcessing(true);
    setStatus('Revoking permission...');
    try {
      // Revoke permission using Account class with paymaster context
      await account.revokePermission(
        request.data.permissionId as `0x${string}`,
        computedPaymasterUrl,
        computedPaymasterContext
      );

      console.log('Permission revoked');
      setStatus('Permission revoked successfully!');
      onApprove({ success: true });
    } catch (error) {
      console.error('Permission revoke failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setStatus(`Error: ${errorObj.message}`);
      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        onReject(UIError.userRejected('User cancelled the passkey prompt'));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorObj.message));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <PermissionDialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleCancel();
        else setOpen(newOpen);
      }}
      mode="revoke"
      permissionId={request.data.permissionId}
      spenderAddress={spenderAddress}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      spends={formattedSpends}
      calls={formattedCalls}
      expiryDate={expiryDate}
      networkName={networkName}
      chainId={chainId}
      apiKey={apiKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
      isLoadingTokenInfo={isLoadingPermissionDetails}
      timestamp={new Date(request.timestamp)}
      mainnetRpcUrl={getMainnetRpcUrl(apiKey)}
      // Gas estimation props
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      // Fee token props for ERC-20 paymaster
      feeTokens={feeTokens}
      feeTokensLoading={feeTokensLoading}
      selectedFeeToken={selectedFeeToken}
      onFeeTokenSelect={setSelectedFeeToken}
      showFeeTokenSelector={!isSponsored && feeTokens.some(t => !t.isNative)}
      isPayingWithErc20={isPayingWithErc20}
      nativeCurrencySymbol={viemChain?.nativeCurrency?.symbol}
    />
  );
}

// UnsupportedMethodDialogWrapper - handles unknown/unsupported methods
function UnsupportedMethodDialogWrapper({
  method,
  onReject,
}: {
  method: string;
  onReject: (error?: Error) => void;
}) {
  const [open, setOpen] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  const handleClose = () => {
    if (!isClosing) {
      setIsClosing(true);
      console.log('❌ Unsupported method:', method);
      setOpen(false);
      // Use UIError.unsupportedRequest which has proper error code
      onReject(UIError.unsupportedRequest(method));
    }
  };

  return (
    <DefaultDialogComponent
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) handleClose();
        else setOpen(newOpen);
      }}
      contentStyle={{
        width: 'fit-content',
        maxWidth: '450px',
      }}
    >
      <div className="flex flex-col gap-6 p-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Unsupported Method
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            This wallet does not support the following method:
          </p>
          <div className="bg-gray-100 rounded-lg p-4">
            <code className="text-sm font-mono text-gray-900 break-all">
              {method}
            </code>
          </div>
        </div>

        {/* Origin */}
        <p className="text-xs text-gray-500 text-center">
          Origin: {origin}
        </p>

        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={isClosing}
          className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-lg transition-colors"
        >
          {isClosing ? 'Closing...' : 'Close'}
        </button>
      </div>
    </DefaultDialogComponent>
  );
}

