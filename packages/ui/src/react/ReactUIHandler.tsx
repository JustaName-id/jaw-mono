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
  SendTransactionUIRequest,
  PermissionUIRequest,
  RevokePermissionUIRequest,
  WalletSignUIRequest,
  PasskeyAccount,
  Account,
  SUPPORTED_CHAINS,
  JAW_RPC_URL,
  SubnameTextRecordCapabilityRequest,
  getPermissionFromRelay,
  type Chain,
} from '@jaw.id/core';
import { formatUnits, erc20Abi, createPublicClient, http } from 'viem';
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
                  chainId: walletSignRequest.data.chainId,
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

      case 'eth_sendTransaction':
        return (
          <SendTransactionDialogWrapper
            request={request as SendTransactionUIRequest}
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
// Used by OnboardingDialogWrapper which needs lower-level control
function buildChainConfigFromApiKey(chainId: number, apiKey?: string, paymasterUrl?: string): Chain {
  return {
    id: chainId,
    rpcUrl: apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`,
    paymasterUrl,
  };
}

// Helper to restore Account for signing operations
async function restoreAccountForSigning(
  apiKey?: string,
  chainId?: number,
  paymasterUrl?: string
): Promise<Account> {
  const targetChainId = chainId || 1;
  return await Account.restore({
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

      // Authenticate with WebAuthn using Account class
      await Account.authenticateWithWebAuthn(account.credentialId, apiKey);

      // Get the smart account address using Account class
      const address = await Account.getAddressForCredential(
        {
          chainId: targetChainId,
          apiKey,
          paymasterUrl: paymasterUrls?.[targetChainId],
        },
        account.credentialId
      );

      // Store auth state using Account class
      Account.storeAuthState(address, account.credentialId, apiKey);

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

      // Import passkey using Account class (prompts user to select from cloud backup)
      const { name, credential } = await Account.importPasskeyCredential(apiKey);

      // Get the smart account address using Account class
      const address = await Account.getAddressForPublicKey(
        {
          chainId: targetChainId,
          apiKey,
          paymasterUrl: paymasterUrls?.[targetChainId],
        },
        credential.id,
        credential.publicKey
      );

      // Store auth state using Account class
      Account.storeAuthState(address, credential.id, apiKey);

      // Add to accounts list using Account class
      const newAccount: PasskeyAccount = {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        username: name,
        creationDate: new Date().toISOString(),
        isImported: true,
      };
      Account.storePasskeyAccount(newAccount, apiKey);

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

      // Create passkey using Account class
      const { credentialId, publicKey } = await Account.createPasskeyCredential(
        username,
        apiKey,
        { rpId, rpName }
      );

      // Get chainId from request or default
      const createChainId = request.data.chainId || defaultChainId || 1;

      // Get the smart account address using Account class
      const address = await Account.getAddressForPublicKey(
        {
          chainId: createChainId,
          apiKey,
          paymasterUrl: paymasterUrls?.[createChainId],
        },
        credentialId,
        publicKey
      );

      // Store auth state using Account class
      Account.storeAuthState(address, credentialId, apiKey);

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
        chainId={targetChainId}
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

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;

  const handleSign = async () => {
    setIsProcessing(true);
    try {
      // Restore account for signing
      const account = await restoreAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Sign the message
      const signature = await account.signMessage(request.data.message);

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

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;

  const handleSign = async () => {
    setIsProcessing(true);
    try {
      // Restore account for signing
      const account = await restoreAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
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
  const [account, setAccount] = useState<Account | null>(null);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const isSponsored = !!paymasterUrls?.[chainId];

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
      value: call.value,
      data: (call.data || '0x') as Hex,
    }));
  }, [request.data.calls]);

  // Initialize account
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await restoreAccountForSigning(
          apiKey,
          chainId,
          paymasterUrls?.[chainId]
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('Error initializing account:', error);
        if (isMounted) {
          setGasEstimationError('Failed to initialize account');
          setGasFeeLoading(false);
        }
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, paymasterUrls]);

  // Gas estimation using Account class
  useEffect(() => {
    if (!account || transactionCalls.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);
        setGasEstimationError('');

        // Estimate gas using Account class
        const gasPrice = await account.calculateGasCost(transactionCalls);
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
  }, [account, transactionCalls, isSponsored]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      if (!account) {
        throw new Error('Account not initialized');
      }

      // Send bundled transaction using Account class
      const result = await account.sendBundledTransaction(transactionCalls);

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

// SendTransactionDialogWrapper - handles eth_sendTransaction (legacy single transaction)
function SendTransactionDialogWrapper({
  request,
  onApprove,
  onReject,
  apiKey,
  defaultChainId,
  paymasterUrls,
}: {
  request: SendTransactionUIRequest;
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
  const [account, setAccount] = useState<Account | null>(null);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const isSponsored = !!paymasterUrls?.[chainId];

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
    value: request.data.value,
    data: (request.data.data || '0x') as Hex,
  }], [request.data]);

  // Initialize account
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await restoreAccountForSigning(
          apiKey,
          chainId,
          paymasterUrls?.[chainId]
        );
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('Error initializing account:', error);
        if (isMounted) {
          setGasEstimationError('Failed to initialize account');
          setGasFeeLoading(false);
        }
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, paymasterUrls]);

  // Gas estimation using Account class
  useEffect(() => {
    if (!account || transactionCalls.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);
        setGasEstimationError('');

        // Estimate gas using Account class
        const gasPrice = await account.calculateGasCost(transactionCalls);
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
  }, [account, transactionCalls, isSponsored]);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      if (!account) {
        throw new Error('Account not initialized');
      }

      // Use sendTransaction which waits for receipt and returns the actual transaction hash
      const txHash = await account.sendTransaction(transactionCalls);

      // eth_sendTransaction returns transaction hash string
      onApprove(txHash);
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
  const [status, setStatus] = useState<string>('');
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState(true);

  // chainId can be number or hex string (like '0x1')
  const requestChainId = request.data.chainId;
  const chainId = typeof requestChainId === 'string'
    ? parseInt(requestChainId, requestChainId.startsWith('0x') ? 16 : 10)
    : (requestChainId || defaultChainId || 1);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chain = useMemo(
    () => buildChainConfigFromApiKey(chainId, apiKey, paymasterUrls?.[chainId]),
    [chainId, apiKey, paymasterUrls]
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

        // If native token, use ETH defaults
        if (isNativeToken(tokenAddress)) {
          newTokenInfoMap[tokenAddress] = { decimals: 18, symbol: 'ETH' };
          continue;
        }

        // Fetch ERC-20 token info
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
        } catch (error) {
          console.error(`Failed to fetch token info for ${tokenAddress}:`, error);
          // Fallback to showing truncated token address
          newTokenInfoMap[tokenAddress] = {
            decimals: 18,
            symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
          };
        }
      }

      setTokenInfoMap(prev => ({ ...prev, ...newTokenInfoMap }));
      setIsLoadingTokenInfo(false);
    };

    fetchAllTokenInfo();
  }, [chainId, spendsData, networkName, chain.rpcUrl]);

  // Convert to SpendPermission array format expected by PermissionDialog
  const spends = useMemo(() => spendsData.map(spend => {
    const tokenInfo = tokenInfoMap[spend.token] || (isNativeToken(spend.token)
      ? { decimals: 18, symbol: 'ETH' }
      : { decimals: 18, symbol: spend.token.slice(0, 6) + '...' + spend.token.slice(-4) });

    const allowance = BigInt(spend.limit);
    const amount = formatUnits(allowance, tokenInfo.decimals);
    const limit = `${amount} ${tokenInfo.symbol}`;

    return {
      amount,
      token: isNativeToken(spend.token) ? 'Native (ETH)' : tokenInfo.symbol,
      tokenAddress: spend.token,
      duration: `1 ${spend.period}`,
      limit,
    };
  }), [spendsData, tokenInfoMap]);

  // Format call permissions
  const calls = useMemo(() => callsData.map(call => ({
    target: call.target,
    selector: call.selector || '',
    functionSignature: call.functionSignature || resolveFunctionSelector(call.selector || ''),
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
    setIsProcessing(true);
    setStatus('Granting permissions...');
    try {
      // Restore account for permission granting
      const account = await restoreAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Use the spends array directly from the request (already in correct format)
      const permissionsDetail = {
        spends: request.data.permissions.spends || [],
        calls: request.data.permissions.calls,
      };

      // Grant permissions using Account class
      const result = await account.grantPermissions(
        request.data.expiry,
        request.data.spender as Address,
        permissionsDetail
      );

      setStatus('Permissions granted successfully!');
      onApprove(result);
    } catch (error) {
      console.error('Permission grant failed:', error);
      setStatus(`Error: ${(error as Error).message}`);
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
      mode="grant"
      spenderAddress={request.data.spender}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      spends={spends}
      calls={calls}
      expiryDate={expiryDate}
      networkName={networkName}
      chainId={chainId}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
      isLoadingTokenInfo={isLoadingTokenInfo}
      timestamp={new Date(request.timestamp)}
      warningMessage={warningMessage}
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

  // Use chainId from request (current chain), fallback to defaultChainId
  const chainId = request.data.chainId || defaultChainId || 1;
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
      // Restore account for signing
      const account = await restoreAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Sign the message
      const signature = await account.signMessage(request.data.message);

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
  const [status, setStatus] = useState<string>('');
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

  // Format call permissions from fetched data
  const formattedCalls = useMemo(() => {
    if (!fetchedPermissionData?.calls) return [];

    return fetchedPermissionData.calls.map((call: any) => ({
      target: call.target,
      selector: call.selector || '',
      functionSignature: call.functionSignature || resolveFunctionSelector(call.selector || ''),
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
    setIsProcessing(true);
    setStatus('Revoking permission...');
    try {
      // Restore account for revoking
      const account = await restoreAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Revoke permission using Account class
      await account.revokePermission(request.data.permissionId as `0x${string}`);

      console.log('Permission revoked');
      setStatus('Permission revoked successfully!');
      onApprove({ success: true });
    } catch (error) {
      console.error('Permission revoke failed:', error);
      setStatus(`Error: ${(error as Error).message}`);
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
      calls={formattedCalls}
      expiryDate={expiryDate}
      networkName={networkName}
      chainId={chainId}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
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

