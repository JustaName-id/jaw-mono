'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  UIHandler,
  UIHandlerConfig,
  UIRequest,
  UIResponse,
  UIError,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  PermissionUIRequest,
  RevokePermissionUIRequest,
  WalletSignUIRequest,
  PasskeyManager,
  PasskeyAccount,
  createSmartAccount,
  getBundlerClient,
  SUPPORTED_CHAINS,
  Chain,
  JAW_RPC_URL,
  toJustanAccount,
  sendBundledTransaction,
  grantPermissions,
  revokePermission,
  getPermissionFromRelay,
  estimateUserOpGas,
  calculateGas,
  SubnameTextRecordCapabilityRequest,
  type JustanAccountImplementation,
  type ToJustanAccountReturnType,
} from '@jaw.id/core';
import { toWebAuthnAccount } from 'viem/account-abstraction';
import { getAddress, parseEther, formatUnits, erc20Abi, createPublicClient, http } from 'viem';
import type { Address, Hex } from 'viem';

// Import UI components using relative paths (we're inside @jaw/ui)
import { OnboardingDialog } from '../components/OnboardingDialog';
import { DefaultDialog, type DefaultDialogProps } from '../components/DefaultDialog';
import { SignatureDialog } from '../components/SignatureDialog';
import { SiweDialog } from '../components/SiweDialog';
import { Eip712Dialog } from '../components/Eip712Dialog';
import { TransactionDialog } from '../components/TransactionDialog';
import { PermissionDialog } from '../components/PermissionDialog';
import { ConnectDialog } from '../components/ConnectDialog';
import { type LocalStorageAccount } from '../components/OnboardingDialog/types';
import { useChainIcon } from '../hooks/useChainIcon';

// ============================================================================
// SIWE (Sign-In with Ethereum) Detection Utilities
// ============================================================================

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

/**
 * Get chain icon key from chain ID (for useChainIcon hook)
 */
function getChainIconKeyFromId(chainId: number): string {
  const chainIconMap: Record<number, string> = {
    1: 'ethereum',
    11155111: 'ethereum', // Sepolia
    8453: 'base',
    84532: 'base', // Base Sepolia
    137: 'polygon',
    80001: 'polygon', // Polygon Mumbai
    42161: 'arbitrum',
    421614: 'arbitrum', // Arbitrum Sepolia
    10: 'optimism',
    11155420: 'optimism', // Optimism Sepolia
  };
  return chainIconMap[chainId] || 'ethereum';
}

// ============================================================================
// Permission Utilities
// ============================================================================

// ERC-7528 native token address
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const isNativeToken = (tokenAddress?: string): boolean => {
  if (!tokenAddress) return true;
  return tokenAddress.toLowerCase() === NATIVE_TOKEN.toLowerCase();
};

// Convert period in seconds to human-readable duration
const formatDurationFromSeconds = (seconds: number): string => {
  if (seconds === 60) return '1 Minute';
  if (seconds === 3600) return '1 Hour';
  if (seconds === 86400) return '1 Day';
  if (seconds === 604800) return '1 Week';
  if (seconds === 2592000) return '1 Month';
  if (seconds === 31536000) return '1 Year';
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} Day${days > 1 ? 's' : ''}`;
  }
  return `${seconds} seconds`;
};

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
 * import { ReactUIHandler } from '@jaw/ui';
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
  private config: UIHandlerConfig = {};

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
          resolve({
            id: request.id,
            approved: false,
            error: error as UIError || UIError.userRejected(),
          });
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
            paymasterUrls={this.config.paymasterUrls}
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
              paymasterUrls={this.config.paymasterUrls}
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
            paymasterUrls={this.config.paymasterUrls}
          />
        );
      }

      case 'wallet_sign': {
        const walletSignRequest = request as WalletSignUIRequest;
        const signType = walletSignRequest.data.request.type;

        if (signType === '0x45') {
          // Personal sign - check for SIWE
          const message = walletSignRequest.data.request.data;
          if (isSiweMessage(message)) {
            return (
              <SiweDialogWrapper
                request={{
                  ...walletSignRequest,
                  type: 'personal_sign',
                  data: {
                    message,
                    address: walletSignRequest.data.address,
                  },
                } as SignatureUIRequest}
                onApprove={onApprove}
                onReject={onReject}
                apiKey={this.config.apiKey}
                defaultChainId={this.config.defaultChainId}
                paymasterUrls={this.config.paymasterUrls}
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
                },
              } as SignatureUIRequest}
              onApprove={onApprove}
              onReject={onReject}
              apiKey={this.config.apiKey}
              defaultChainId={this.config.defaultChainId}
              paymasterUrls={this.config.paymasterUrls}
            />
          );
        } else if (signType === '0x01') {
          // EIP-712 typed data
          return (
            <Eip712DialogWrapper
              request={{
                ...walletSignRequest,
                type: 'eth_signTypedData_v4',
                data: {
                  typedData: walletSignRequest.data.request.data,
                  address: walletSignRequest.data.address,
                },
              } as TypedDataUIRequest}
              onApprove={onApprove}
              onReject={onReject}
              apiKey={this.config.apiKey}
              defaultChainId={this.config.defaultChainId}
              paymasterUrls={this.config.paymasterUrls}
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
            paymasterUrls={this.config.paymasterUrls}
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
            paymasterUrls={this.config.paymasterUrls}
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
            paymasterUrls={this.config.paymasterUrls}
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
            paymasterUrls={this.config.paymasterUrls}
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
function buildChainConfigFromApiKey(chainId: number, apiKey?: string, paymasterUrl?: string): Chain {
  return {
    id: chainId,
    rpcUrl: apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : undefined,
    paymasterUrl,
  };
}

// Helper to recreate smart account for signing operations
async function recreateSmartAccountForSigning(
  apiKey?: string,
  chainId?: number,
  paymasterUrl?: string
) {
  const passkeyManager = new PasskeyManager(undefined, undefined, apiKey);
  const currentAccount = passkeyManager.getCurrentAccount();

  if (!currentAccount) {
    throw new Error('No authenticated account found. Please connect first.');
  }

  const webAuthnAccount = toWebAuthnAccount({
    credential: {
      id: currentAccount.credentialId,
      publicKey: currentAccount.publicKey,
    },
  });

  const targetChainId = chainId || 1;
  const chain = buildChainConfigFromApiKey(targetChainId, apiKey, paymasterUrl);
  const client = getBundlerClient(chain);

  const smartAccount = await toJustanAccount({
    client: client as JustanAccountImplementation['client'],
    owners: [webAuthnAccount],
  });

  return { smartAccount, chain, webAuthnAccount };
}

// OnboardingDialogWrapper - handles passkey authentication flow with ConnectDialog confirmation
function OnboardingDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasterUrls,
}: {
  request: ConnectUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [accounts, setAccounts] = useState<LocalStorageAccount[]>([]);
  const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // Use refs to store pending values that callbacks can access immediately
  const pendingAddressRef = React.useRef<string | null>(null);
  const pendingUsernameRef = React.useRef<string | null>(null);

  // State for ConnectDialog confirmation
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [authenticatedAccountName, setAuthenticatedAccountName] = useState<string | null>(null);
  const [authenticatedWalletAddress, setAuthenticatedWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Get rpId from current domain
  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const rpName = 'JAW Wallet';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  // Get chain info for ConnectDialog
  const targetChainId = request.data.chainId || defaultChainId || 1;
  const chainName = getChainNameFromId(targetChainId);
  const chainIconKey = getChainIconKeyFromId(targetChainId);
  const chainIcon = useChainIcon(chainIconKey, 24);

  // Initialize PasskeyManager and load accounts
  const passkeyManager = useMemo(() => new PasskeyManager(undefined, undefined, apiKey), [apiKey]);

  // Load accounts on mount
  useEffect(() => {
    const loadAccounts = () => {
      const storedAccounts = passkeyManager.fetchAccounts();
      setAccounts(storedAccounts.map(acc => ({
        username: acc.username,
        creationDate: new Date(acc.creationDate),
        credentialId: acc.credentialId,
        isImported: acc.isImported,
      })));
    };
    loadAccounts();
  }, [passkeyManager]);

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
      setLoggingInAccount(account.username);

      // Authenticate with WebAuthn
      await passkeyManager.authenticateWithWebAuthn(rpId, account.credentialId, {
        userVerification: 'preferred',
        timeout: 60000,
        transports: ['internal', 'hybrid'],
      });

      // Get the stored account to recreate smart account
      const storedAccount = passkeyManager.getAccountByCredentialId(account.credentialId);
      if (!storedAccount) {
        throw new Error('Account not found');
      }

      // Create WebAuthn account from stored credential
      const webAuthnAccount = toWebAuthnAccount({
        credential: {
          id: storedAccount.credentialId,
          publicKey: storedAccount.publicKey,
        },
      });

      // Get chainId from request or default and build chain config with auto-resolved RPC URL
      const targetChain = buildChainConfigFromApiKey(targetChainId, apiKey, paymasterUrls?.[targetChainId]);
      const client = getBundlerClient(targetChain);

      // Create smart account
      const smartAccount = await createSmartAccount(webAuthnAccount, client as JustanAccountImplementation['client']);
      const address = getAddress(smartAccount.address);

      // Store auth state
      passkeyManager.storeAuthState(address, account.credentialId);

      // Show ConnectDialog for confirmation instead of immediately approving
      setAuthenticatedAccountName(account.username);
      setAuthenticatedWalletAddress(address);
      setShowConnectDialog(true);
    } catch (error) {
      console.error('Login failed:', error);
      setLoggingInAccount(null);
    }
  };

  // Handle importing an existing passkey from cloud
  const handleImportAccount = async () => {
    try {
      setIsImporting(true);

      // Import passkey (prompts user to select from cloud backup)
      const result = await passkeyManager.importPasskeyAccount();
      const { name, credential } = result;

      // Create WebAuthn account
      const webAuthnAccount = toWebAuthnAccount({
        credential: {
          id: credential.id,
          publicKey: credential.publicKey,
        },
      });

      // Get chainId from request or default and build chain config with auto-resolved RPC URL
      const targetChain = buildChainConfigFromApiKey(targetChainId, apiKey, paymasterUrls?.[targetChainId]);
      const client = getBundlerClient(targetChain);

      // Create smart account
      const smartAccount = await createSmartAccount(webAuthnAccount, client as JustanAccountImplementation['client']);
      const address = getAddress(smartAccount.address);

      // Store auth state
      passkeyManager.storeAuthState(address, credential.id);

      // Add to accounts list
      const newAccount: PasskeyAccount = {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        username: name,
        creationDate: new Date().toISOString(),
        isImported: true,
      };
      passkeyManager.addAccountToList(newAccount);

      // Show ConnectDialog for confirmation instead of immediately approving
      setAuthenticatedAccountName(name);
      setAuthenticatedWalletAddress(address);
      setShowConnectDialog(true);
      setIsImporting(false);
    } catch (error) {
      console.error('Import failed:', error);
      setIsImporting(false);
    }
  };

  // Handle creating a new account
  const handleCreateAccount = async (username: string): Promise<string> => {
    try {
      setIsCreating(true);

      // Create passkey
      const { credentialId, webAuthnAccount } = await passkeyManager.createPasskey(
        username,
        rpId,
        rpName
      );

      // Get chainId from request or default and build chain config with auto-resolved RPC URL
      const targetChainId = request.data.chainId || defaultChainId || 1;
      const targetChain = buildChainConfigFromApiKey(targetChainId, apiKey, paymasterUrls?.[targetChainId]);
      const client = getBundlerClient(targetChain);

      // Create smart account
      const smartAccount = await createSmartAccount(webAuthnAccount, client as JustanAccountImplementation['client']);
      const address = getAddress(smartAccount.address);

      // Store auth state
      passkeyManager.storeAuthState(address, credentialId);

      // Store address and username for completion callback
      // Use refs since they are immediately available for callbacks
      pendingAddressRef.current = address;
      pendingUsernameRef.current = username;

      return address;
    } catch (error) {
      console.error('Account creation failed:', error);
      setIsCreating(false);
      throw error;
    }
  };

  // Handle account creation completion (after subname registration if applicable)
  // Note: We use the refs since state updates may not be synchronous when this callback is called
  const handleAccountCreationComplete = async () => {
    const address = pendingAddressRef.current;
    const username = pendingUsernameRef.current;

    if (address) {
      // Show ConnectDialog for confirmation instead of immediately approving
      setAuthenticatedAccountName(username || 'New Account');
      setAuthenticatedWalletAddress(address);
      setShowConnectDialog(true);
    } else {
      console.error('[OnboardingDialogWrapper] handleAccountCreationComplete called but pendingAddress is null');
    }
    setIsCreating(false);
  };

  // Get config from request - capabilities is Record<string, unknown>
  const ensDomain = request.data.capabilities?.ensDomain as string | undefined;
  const chainId = request.data.chainId || defaultChainId || 1;
  const subnameTextRecords = request.data.capabilities?.subnameTextRecords as SubnameTextRecordCapabilityRequest | undefined;

  // If showing ConnectDialog confirmation, render that instead
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
        chainIcon={chainIcon}
        onConnect={async () => handleConnectConfirm()}
        onCancel={handleConnectCancel}
        isProcessing={isConnecting}
      />
    );
  }

  return (
    <DefaultDialogComponent
      open={open}
      onOpenChange={setOpen}
      handleClose={handleCancel}
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
  paymasterUrls,
}: {
  request: SignatureUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // SignatureUIRequest doesn't have chainId, use defaultChainId
  const chainId = defaultChainId || 1;

  const handleSign = async () => {
    setIsProcessing(true);
    try {
      // Recreate smart account for signing
      const { smartAccount } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Sign the message
      const signature = await smartAccount.signMessage({
        message: request.data.message
      });

      onApprove(signature);
    } catch (error) {
      console.error('Signature failed:', error);
      onReject(error as Error);
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
      onOpenChange={setOpen}
      message={request.data.message}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      timestamp={new Date(request.timestamp)}
      accountAddress={request.data.address}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus="pending"
      canSign={true}
    />
  );
}

function Eip712DialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasterUrls,
}: {
  request: TypedDataUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // TypedDataUIRequest doesn't have chainId, use defaultChainId
  const chainId = defaultChainId || 1;

  const handleSign = async () => {
    setIsProcessing(true);
    try {
      // Recreate smart account for signing
      const { smartAccount } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Parse typed data if it's a string
      const typedData = typeof request.data.typedData === 'string'
        ? JSON.parse(request.data.typedData)
        : request.data.typedData;

      // Sign the typed data
      const signature = await smartAccount.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });

      onApprove(signature);
    } catch (error) {
      console.error('EIP-712 signature failed:', error);
      onReject(error as Error);
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
      onOpenChange={setOpen}
      typedDataJson={request.data.typedData}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      timestamp={new Date(request.timestamp)}
      accountAddress={request.data.address}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus="pending"
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
  paymasterUrls,
}: {
  request: TransactionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState(true);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [smartAccount, setSmartAccount] = useState<ToJustanAccountReturnType | null>(null);

  const chainId = request.data.chainId || defaultChainId || 1;
  const chain = useMemo(
    () => buildChainConfigFromApiKey(chainId, apiKey, paymasterUrls?.[chainId]),
    [chainId, apiKey, paymasterUrls]
  );
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const isSponsored = !!paymasterUrls?.[chainId];

  // Transform calls to transactions format expected by dialog and gas estimation
  const transactions = useMemo(() => request.data.calls.map(call => ({
    to: call.to,
    data: call.data,
    value: call.value,
    chainId: request.data.chainId,
  })), [request.data.calls, request.data.chainId]);

  // Convert transactions to call format for smart account operations
  const transactionCalls = useMemo(() => {
    return request.data.calls.map(call => {
      let value = 0n;
      if (call.value && call.value !== '0') {
        if (call.value.startsWith('0x')) {
          value = BigInt(call.value);
        } else if (/^\d+$/.test(call.value)) {
          value = BigInt(call.value);
        } else {
          value = parseEther(call.value);
        }
      }
      return {
        to: call.to as Address,
        value,
        data: (call.data || '0x') as Hex,
      };
    });
  }, [request.data.calls]);

  // Initialize smart account
  useEffect(() => {
    let isMounted = true;

    const initializeSmartAccount = async () => {
      try {
        const { smartAccount: account } = await recreateSmartAccountForSigning(
          apiKey,
          chainId,
          paymasterUrls?.[chainId]
        );
        if (isMounted) {
          setSmartAccount(account);
        }
      } catch (error) {
        console.error('Error initializing smart account:', error);
        if (isMounted) {
          setGasEstimationError('Failed to initialize account');
          setGasFeeLoading(false);
        }
      }
    };

    initializeSmartAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, paymasterUrls]);

  // Gas estimation using core package
  useEffect(() => {
    if (!smartAccount || transactionCalls.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);
        setGasEstimationError('');

        // Estimate gas using core package
        const gasEstimate = await estimateUserOpGas(smartAccount, transactionCalls, chain);
        const gasPrice = await calculateGas(chain, gasEstimate);
        setGasFee(gasPrice);

        // Override with sponsored if paymaster is available
        if (isSponsored) {
          setGasFee('sponsored');
        }
      } catch (error) {
        console.error('Error estimating gas:', error);

        if (error instanceof Error && (error.message.includes('AA21') || error.message.includes("didn't pay prefund"))) {
          if (isSponsored) {
            setGasFee('sponsored');
            setGasEstimationError('');
          } else {
            setGasFee('');
            setGasEstimationError('Insufficient funds');
          }
        } else {
          setGasFee('');
          setGasEstimationError('Failed to estimate gas');
        }
      } finally {
        setGasFeeLoading(false);
      }
    };

    estimateGas();
  }, [smartAccount, transactionCalls, chain, isSponsored]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      if (!smartAccount) {
        throw new Error('Smart account not initialized');
      }

      // Send bundled transaction using core SDK
      const result = await sendBundledTransaction(smartAccount, transactionCalls, chain);

      onApprove({
        id: result.id,
        chainId: result.chainId,
      });
    } catch (error) {
      console.error('Transaction failed:', error);
      onReject(error as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  return (
    <TransactionDialog
      open={open}
      onOpenChange={setOpen}
      transactions={transactions}
      walletAddress={request.data.from}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      ethPrice={0}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus="pending"
      networkName={networkName}
    />
  );
}

function PermissionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasterUrls,
}: {
  request: PermissionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // chainId can be number or hex string (like '0x1')
  const requestChainId = request.data.chainId;
  const chainId = typeof requestChainId === 'string'
    ? parseInt(requestChainId, requestChainId.startsWith('0x') ? 16 : 10)
    : (requestChainId || defaultChainId || 1);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      // Recreate smart account for signing
      const { smartAccount, chain } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Use the spends array directly from the request (already in correct format)
      const permissionsDetail = {
        spends: request.data.permissions.spends || [],
        calls: request.data.permissions.calls,
      };

      // Grant permissions using core SDK
      const result = await grantPermissions(
        smartAccount,
        request.data.expiry,
        request.data.spender,
        permissionsDetail,
        chain,
        apiKey || ''
      );

      onApprove(result);
    } catch (error) {
      console.error('Permission grant failed:', error);
      onReject(error as Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setOpen(false);
    onReject(UIError.userRejected());
  };

  // Get spends array from request (now using spends plural)
  const spendsData = request.data.permissions.spends || [];

  // Convert to SpendPermission array format expected by PermissionDialog
  const spends = spendsData.map(spend => ({
    amount: spend.limit,
    token: spend.token.slice(0, 10) + '...',  // Display truncated token
    tokenAddress: spend.token,
    duration: `1 ${spend.period}`,
    limit: spend.limit,
  }));

  return (
    <PermissionDialog
      open={open}
      onOpenChange={setOpen}
      mode="grant"
      spenderAddress={request.data.spender}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      spends={spends}
      expiryDate={new Date(request.data.expiry).toLocaleDateString()}
      networkName={networkName}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      timestamp={new Date(request.timestamp)}
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
  paymasterUrls,
}: {
  request: SignatureUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [siweStatus, setSiweStatus] = useState<string>('');

  const chainId = defaultChainId || 1;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 24);
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

  const handleSign = async () => {
    setIsProcessing(true);
    setSiweStatus('Signing message...');
    try {
      // Recreate smart account for signing
      const { smartAccount } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Sign the message
      const signature = await smartAccount.signMessage({
        message: request.data.message
      });

      setSiweStatus('Sign-in successful!');
      onApprove(signature);
    } catch (error) {
      console.error('SIWE signature failed:', error);
      setSiweStatus(`Error: ${(error as Error).message}`);
      onReject(error as Error);
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
      onOpenChange={setOpen}
      message={decodedMessage}
      origin={origin}
      timestamp={new Date(request.timestamp)}
      appName={appName}
      accountAddress={request.data.address}
      chainName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      onSign={handleSign}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      siweStatus={siweStatus}
      canSign={!isProcessing}
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
  paymasterUrls,
}: {
  request: RevokePermissionUIRequest;
  onApprove: (data: any) => void;
  onReject: (error?: Error) => void;
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}) {
  const [open, setOpen] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingPermissionDetails, setIsLoadingPermissionDetails] = useState(true);
  const [fetchedPermissionData, setFetchedPermissionData] = useState<any>(null);
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});

  const chainId = request.data.chainId || defaultChainId || 1;
  const chain = buildChainConfigFromApiKey(chainId, apiKey, paymasterUrls?.[chainId]);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const chainIconKey = getChainIconKeyFromId(chainId);

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
              newTokenInfoMap[tokenAddress] = { decimals: 18, symbol: 'ETH' };
            } else {
              try {
                const publicClient = createPublicClient({
                  chain: {
                    id: chainId,
                    name: networkName,
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
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
  }, [request.data.permissionId, apiKey, chainId, networkName, chain.rpcUrl]);

  // Format spends for display
  const formattedSpends = useMemo(() => {
    if (!fetchedPermissionData?.spends) return [];

    return fetchedPermissionData.spends.map((spend: any) => {
      const tokenAddress = spend.token;
      const tokenInfo = tokenInfoMap[tokenAddress] || { decimals: 18, symbol: 'ETH' };
      const allowance = BigInt(spend.allowance);
      const amount = formatUnits(allowance, tokenInfo.decimals);
      const limit = `${amount} ${tokenInfo.symbol}`;
      const duration = formatDurationFromSeconds(parseInt(spend.period, 10));

      return {
        amount,
        token: isNativeToken(tokenAddress)
          ? 'Native (ETH)'
          : tokenInfo.symbol,
        tokenAddress,
        duration,
        limit,
      };
    });
  }, [fetchedPermissionData, tokenInfoMap]);

  // Expiry date from fetched permission
  const expiryDate = useMemo(() => {
    if (!fetchedPermissionData) return '';
    const endTimestamp = parseInt(fetchedPermissionData.end, 10);
    return formatExpiryDate(endTimestamp);
  }, [fetchedPermissionData]);

  // Spender address from fetched permission
  const spenderAddress = fetchedPermissionData?.spender || '0x...';

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      // Recreate smart account for revoking
      const { smartAccount } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Revoke permission
      await revokePermission(
        smartAccount,
        request.data.permissionId as `0x${string}`,
        chain,
        apiKey || ''
      );

      console.log('✅ Permission revoked');
      onApprove({ success: true });
    } catch (error) {
      console.error('Permission revoke failed:', error);
      onReject(error as Error);
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
      onOpenChange={setOpen}
      mode="revoke"
      permissionId={request.data.permissionId}
      spenderAddress={spenderAddress}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      spends={formattedSpends}
      expiryDate={expiryDate}
      networkName={networkName}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      isLoadingTokenInfo={isLoadingPermissionDetails}
      timestamp={new Date(request.timestamp)}
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
      // Create a standard unsupported method error
      const unsupportedError = new Error(`Method not supported: ${method}`);
      (unsupportedError as any).code = -32601; // JSON-RPC standard "Method not found" error code
      console.log('❌ Unsupported method:', method);
      setOpen(false);
      onReject(unsupportedError);
    }
  };

  return (
    <DefaultDialogComponent
      open={open}
      onOpenChange={setOpen}
      handleClose={handleClose}
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

