import React, { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  UIHandler,
  UIRequest,
  UIResponse,
  UIError,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  PermissionUIRequest,
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
  SubnameTextRecordCapabilityRequest,
  type JustanAccountImplementation,
} from '@jaw.id/core';
import {
  OnboardingDialog,
  DefaultDialog as DefaultDialogBase,
  SignatureDialog,
  Eip712Dialog,
  TransactionDialog,
  PermissionDialog,
  LocalStorageAccount,
  type DefaultDialogProps,
} from '@jaw/ui';

// Type assertion to fix React types version mismatch between packages
const DefaultDialog: React.ComponentType<DefaultDialogProps> = DefaultDialogBase as React.ComponentType<DefaultDialogProps>;
import { toWebAuthnAccount } from 'viem/account-abstraction';
import { getAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { JAWProvider } from './JAWProvider';

interface ReactWebUIHandlerConfig {
  apiKey?: string;
  defaultChainId?: number;
  paymasterUrls?: Record<number, string>;
}

class ReactWebUIHandler implements UIHandler {
  private config: ReactWebUIHandlerConfig;

  constructor(config: ReactWebUIHandlerConfig = {}) {
    this.config = config;
  }

  async request<T = unknown>(request: UIRequest): Promise<UIResponse<T>> {
    return new Promise((resolve) => {
      const container = document.createElement('div');
      container.setAttribute('data-jaw-modal-container', '');

      // Append to body - Radix UI Dialog will handle all positioning
      document.body.appendChild(container);

      const root = createRoot(container);

      const cleanup = () => {
        root.unmount();
        if (container.parentNode) {
          container.parentNode.removeChild(container);
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
      const dialog = this.renderDialog(request, handleApprove, handleReject);
      root.render(dialog);
    });
  }

  canHandle(request: UIRequest): boolean {
    return ['wallet_connect', 'personal_sign', 'eth_signTypedData_v4', 'wallet_sendCalls', 'wallet_grantPermissions'].includes(request.type);
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

      case 'personal_sign':
        return (
          <SignatureDialogWrapper
            request={request as SignatureUIRequest}
            onApprove={onApprove}
            onReject={onReject}
            apiKey={this.config.apiKey}
            defaultChainId={this.config.defaultChainId}
            paymasterUrls={this.config.paymasterUrls}
          />
        );

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

      default: {
        // This should never happen due to discriminated union, but TypeScript needs it
        const exhaustiveCheck: never = request;
        throw UIError.unsupportedRequest((exhaustiveCheck as UIRequest).type);
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

// OnboardingDialogWrapper - handles passkey authentication flow
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
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);

  // Get rpId from current domain
  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const rpName = 'JAW Wallet';

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
    onReject(UIError.userRejected());
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
      const targetChainId = request.data.chainId || defaultChainId || 1;
      const targetChain = buildChainConfigFromApiKey(targetChainId, apiKey, paymasterUrls?.[targetChainId]);
      const client = getBundlerClient(targetChain);

      // Create smart account
      const smartAccount = await createSmartAccount(webAuthnAccount, client as JustanAccountImplementation['client']);
      const address = getAddress(smartAccount.address);

      // Store auth state
      passkeyManager.storeAuthState(address, account.credentialId);

      // Return the connected account
      onApprove({
        accounts: [{ address }],
      });
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
      const targetChainId = request.data.chainId || defaultChainId || 1;
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

      // Return the connected account
      onApprove({
        accounts: [{ address }],
      });
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
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

      // Store address for completion callback
      setPendingAddress(address);

      return address;
    } catch (error) {
      console.error('Account creation failed:', error);
      setIsCreating(false);
      throw error;
    }
  };

  // Handle account creation completion (after subname registration if applicable)
  const handleAccountCreationComplete = async () => {
    if (pendingAddress) {
      onApprove({
        accounts: [{ address: pendingAddress }],
      });
    }
    setIsCreating(false);
  };

  // Get config from request - capabilities is Record<string, unknown>
  const ensDomain = request.data.capabilities?.ensDomain as string | undefined;
  const chainId = request.data.chainId || defaultChainId || 1;
  const subnameTextRecords = request.data.capabilities?.subnameTextRecords as SubnameTextRecordCapabilityRequest | undefined;

  return (
    <DefaultDialog
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
    </DefaultDialog>
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
  const [gasFee] = useState<string>('Sponsored');
  const [gasFeeLoading] = useState(false);

  const chainId = request.data.chainId || defaultChainId || 1;
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const networkName = viemChain?.name || 'Unknown Network';
  const isSponsored = !!paymasterUrls?.[chainId];

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      // Recreate smart account for signing
      const { smartAccount, chain } = await recreateSmartAccountForSigning(
        apiKey,
        chainId,
        paymasterUrls?.[chainId]
      );

      // Convert calls to proper format
      const transactionCalls = request.data.calls.map(call => ({
        to: call.to as Address,
        value: call.value ? BigInt(call.value) : 0n,
        data: (call.data || '0x') as Hex,
      }));

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

  // Transform calls to transactions format expected by dialog
  const transactions = request.data.calls.map(call => ({
    to: call.to,
    data: call.data,
    value: call.value,
    chainId: request.data.chainId,
  }));

  return (
    <TransactionDialog
      open={open}
      onOpenChange={setOpen}
      transactions={transactions}
      walletAddress={request.data.from}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError=""
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

  const chainId = request.data.chainId || defaultChainId || 1;
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

      // Grant permissions using core SDK
      const result = await grantPermissions(
        smartAccount,
        request.data.address,
        String(chainId), // grantPermissions expects chainId as string
        request.data.expiry,
        request.data.spender,
        request.data.permissions,
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

  const permission = request.data.permissions.spend;

  return (
    <PermissionDialog
      open={open}
      onOpenChange={setOpen}
      mode="grant"
      spenderAddress={request.data.spender}
      origin={typeof window !== 'undefined' ? window.location.origin : 'unknown'}
      amount={permission.limit}
      token={permission.token}
      duration={`1 ${permission.period}`}
      expiryDate={new Date(request.data.expiry).toLocaleDateString()}
      limit={permission.limit}
      networkName={networkName}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      timestamp={new Date(request.timestamp)}
    />
  );
}

export interface JAWUIProviderProps extends Omit<React.ComponentProps<typeof JAWProvider>, 'children'> {
  children: React.ReactNode;
  paymasterUrls?: Record<number, string>;
}

export function JAWUIProvider({ children, preference, apiKey, defaultChainId, paymasterUrls, ...jawProps }: JAWUIProviderProps): React.ReactElement {
  // Create UI handler with apiKey, defaultChainId, and paymasterUrls for passkey operations
  const uiHandler = useMemo(() => new ReactWebUIHandler({
    apiKey,
    defaultChainId,
    paymasterUrls,
  }), [apiKey, defaultChainId, paymasterUrls]);

  // Merge uiHandler into preference
  const preferenceWithHandler = useMemo(() => ({
    ...preference,
    uiHandler,
  }), [preference, uiHandler]);

  return (
    <JAWProvider {...jawProps} apiKey={apiKey} defaultChainId={defaultChainId} preference={preferenceWithHandler}>
      {children}
    </JAWProvider>
  );
}