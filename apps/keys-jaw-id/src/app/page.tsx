'use client';

import { useEffect, useState } from 'react';
import { useAuth, usePasskeys } from '../hooks';
import { SignInScreen } from '../components/OnboardingSection';
import { SignatureModal } from '../components/SignatureModal';
import { TransactionModal, type TransactionResult, type TransactionRequestData } from '../components/TransactionModal';
import { SDKRequestType } from '../lib/sdk-types';
import type { PasskeyAccount } from '@jaw.id/core';
import { PopupCommunicator, type Message } from '../lib/popup-communicator';
import { CryptoHandler } from '../lib/crypto-handler';
import type { RPCRequestMessage } from '@jaw.id/core';
import type { Chain as chain } from '@jaw.id/core';
import { extractTransactionData, type WalletSendCallsReturn, type EthSendTransactionReturn } from '../lib/tx-handler';
import { ChainId } from '@justaname.id/sdk';
import type { PopupConfig, PendingRequest } from '../utils/types';
import { extractSubnameTextRecords } from '../lib/extractSubnameTexts';


// Note: TransactionRequestData is now imported from TransactionModal for consistency

// Simple state types
type PopupState =
  | 'initializing'
  | 'passkey-check'
  | 'passkey-create'
  | 'passkey-auth'
  | 'account-selection'
  | 'processing'
  | 'success'
  | 'error';






export default function KeysJawIdApp() {
  // Use hooks for passkey operations
  const authQuery = useAuth();
  const passkeyQuery = usePasskeys();

  // Service instances (created once)
  const [communicator] = useState(() => new PopupCommunicator());
  const [cryptoHandler] = useState(() => new CryptoHandler());

  // Simple state
  const [isSDKMode, setIsSDKMode] = useState(false);
  const [state, setState] = useState<PopupState>('initializing');
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [currentAccount, setCurrentAccount] = useState<PasskeyAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ensConfig, setEnsConfig] = useState<string | undefined>(undefined);
  const [chainId, setChainId] = useState<ChainId | undefined>(undefined);
  const [apiKey, setApiKey] = useState<string | undefined>(undefined);

  // Single useEffect for all message handling
  useEffect(() => {
    // Check if running in popup mode
    if (!communicator.hasOpener()) {
      console.log('📱 Running in normal mode (no opener)');
      setIsSDKMode(false);
      return;
    }

    console.log('🚀 Running in SDK popup mode');
    setIsSDKMode(true);

    // Initialize crypto handler
    cryptoHandler.initialize().then(() => {
      console.log('✅ CryptoHandler initialized');
      // Send PopupLoaded event
      communicator.sendPopupLoaded();
    }).catch(err => {
      console.error('❌ Failed to initialize CryptoHandler:', err);
      setError('Failed to initialize');
      setState('error');
    });

    // Listen for messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = communicator.onMessage<PopupConfig>((message: any) => {
      console.log('📥 Received message:', message);

      // Handle config message
      if (message.data?.version) {

        setConfig(message.data);
        setEnsConfig(message.data.preference?.ens);
        setChainId(message.data.metadata?.defaultChainId as ChainId);
        setApiKey(message.data.apiKey);

        // Always show account selection UI - never auto-authenticate
        checkForPasskeys();

        // Send PopupReady to signal we're ready for business messages
        communicator.sendPopupReady();
      }

      // Handle selectSignerType event
      if (message.event === 'selectSignerType') {
        communicator.sendResponse(message.id, 'scw');
      }

      // Handle RPC requests
      if (message.id && message.sender && message.content) {
        const rpcMessage = message as RPCRequestMessage;

        // Handle handshake (unencrypted initial request)
        if ('handshake' in rpcMessage.content) {
          handleHandshakeRequest(rpcMessage);
        }

        // Handle encrypted request
        if ('encrypted' in rpcMessage.content) {
          handleEncryptedRequest(rpcMessage);
        }
      }
    });

    // Send PopupUnload on unmount
    return () => {
      communicator.sendPopupUnload();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle transition to account-selection when handshake arrives for authenticated users
  useEffect(() => {
    if (
      pendingRequest?.type === SDKRequestType.CONNECT &&
      currentAccount &&
      (state === 'processing' || state === 'passkey-auth' || state === 'passkey-create')
    ) {
      setState('account-selection');
    }
  }, [pendingRequest, state, currentAccount]);

  // Check for existing passkeys using hooks
  const checkForPasskeys = async () => {
    setState('passkey-check');

    try {
      // Refetch and use the returned fresh data (not the cached hook values)
      const accountsResult = await passkeyQuery.refetchAccounts();

      const accounts = accountsResult.data || [];

      if (accounts.length > 0) {
        // Has accounts - show account selection/auth screen
        setState('passkey-auth');
      } else {
        // No accounts - need to create
        setState('passkey-create');
      }
    } catch (err) {
      console.error('❌ Error checking passkeys:', err);
      setError('Failed to check for passkeys');
      setState('error');
    }
  };

  // Handle handshake request (unencrypted)
  const handleHandshakeRequest = async (request: RPCRequestMessage) => {
    try {

      // Clear old keys and process new handshake
      await cryptoHandler.clear();
      await cryptoHandler.processHandshakeRequest(request);


      if (!('handshake' in request.content) || !request.content.handshake) {
        console.error('❌ Invalid handshake request');
        return;
      }

      console.log('🔍 =========================');
      console.log('🔍 HANDSHAKE REQUEST RECEIVED:');
      console.log('🔍 =========================');
      console.log(JSON.stringify(request, null, 2));
      console.log('🔍 =========================');

      // Determine request type
      const method = request.content.handshake.method;
      const params = request.content.handshake.params;
      const apiKeyFromProvider = request.content?.chain?.rpcUrl?.split('api-key=')[1];

      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // For pure key exchange handshake (method: 'handshake'), send immediate response
      if (method === 'handshake') {
        // Send empty accounts response for key exchange handshake
        const response = await cryptoHandler.createHandshakeResponse(request.id, []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        communicator.sendMessage(response as unknown as Message);
        return;
      }

      // For eth_requestAccounts and wallet_connect, we need to show approval UI
      if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
        const origin = communicator.getOrigin() || "";
        setPendingRequest({
          origin,
          type: SDKRequestType.CONNECT,
          requestId: request.id || '',
          correlationId: request.correlationId || '',
          metadata: config?.metadata || null,
          method,
          params: Array.isArray(params) ? params : [],
          chain: undefined,
          onApprove: async (result: unknown) => {
            const accounts = result as string[];
            const response = await cryptoHandler.createHandshakeResponse(request.id, accounts);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(response as any);
          },
          onReject: async (error: string) => {
            // Send error response for handshake rejection
            try {
              const errorResponse = await cryptoHandler.createEncryptedErrorResponse(
                request.id,
                request.correlationId || '',
                4001, // User rejected request (EIP-1193 standard)
                error || 'User rejected the request'
              );
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              communicator.sendMessage(errorResponse as any);
            } catch (err) {
              console.error('❌ Failed to send rejection response:', err);
            }
          },
        });
      }
    } catch (err) {
      console.error('❌ Failed to handle handshake:', err);
      setError(err instanceof Error ? err.message : 'Handshake failed');
      setState('error');
    }
  };

  // Handle encrypted request
  const handleEncryptedRequest = async (request: RPCRequestMessage) => {
    try {
      // Restore shared secret from message
      await cryptoHandler.restoreSharedSecretFromMessage(request);

      // Decrypt the request
      const decrypted = await cryptoHandler.decryptRequest(request);

      const method = decrypted.action.method;
      const params = decrypted.action.params;
      const chain = decrypted.chain;

      // Determine request type and show appropriate UI
      let requestType: SDKRequestType;

      // Check for sign message requests
      // personal_sign: always a sign message request
      // wallet_sign: only if request.type === "0x45" (Personal Sign per EIP-191)
      if (method === 'personal_sign' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === "0x45")) {
        requestType = SDKRequestType.SIGN_MESSAGE;
      } else if (method === 'wallet_sendCalls' || method === 'eth_sendTransaction') {
        requestType = SDKRequestType.SEND_TRANSACTION;
      } else if (method === 'eth_chainId') {
        requestType = SDKRequestType.CHAIN_ID;
      } else if (method === 'wallet_getSubAccounts') {
        requestType = SDKRequestType.GET_SUB_ACCOUNTS;
      } else if (method === 'wallet_importSubAccount') {
        requestType = SDKRequestType.IMPORT_SUB_ACCOUNT;
      } else if (method === 'wallet_connect') {
        requestType = SDKRequestType.CONNECT;
      } else {
        console.warn('⚠️ Unknown method:', method);
        requestType = SDKRequestType.CONNECT; // fallback
      }

      const origin = communicator.getOrigin() ?? '';
      setPendingRequest({
        origin,
        type: requestType,
        requestId: request.id || '',
        correlationId: request.correlationId || '',
        metadata: config?.metadata || null,
        method,
        params: Array.isArray(params) ? params : [],
        chain: chain?.rpcUrl ? { id: chain.id, rpcUrl: chain.rpcUrl, paymasterUrl: chain.paymasterUrl } : undefined,
        onApprove: async (result: unknown) => {
          // For wallet_connect, format as WalletConnectResponse
          let responseData: unknown = result;
          if (method === 'wallet_connect') {
            const accounts = Array.isArray(result) ? result : [result];
            responseData = {
              accounts: accounts.map((address: string) => ({ address }))
            };
          }
          
          const response = await cryptoHandler.createEncryptedResponse(
            request.id || '',
            request.correlationId || '',
            responseData
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communicator.sendMessage(response as any);
        },
        onReject: async (error: string) => {
          // Send standard error response (EIP-1193 code 4001)
          try {
            const errorResponse = await cryptoHandler.createEncryptedErrorResponse(
              request.id || '',
              request.correlationId || '',
              4001, // User rejected request (EIP-1193 standard)
              error || 'User rejected the request'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(errorResponse as any);
            // Close window after sending error
            setTimeout(() => window.close(), 100);
          } catch (err) {
            console.error('❌ Failed to send rejection response:', err);
            window.close();
          }
        },
      });

      // For sign message and transaction requests, if user is authenticated, show modal directly
      if ((requestType === SDKRequestType.SIGN_MESSAGE || requestType === SDKRequestType.SEND_TRANSACTION) && authQuery.isAuthenticated && currentAccount) {
        // The modal will be shown in the render logic below
        return;
      }
    } catch (err) {
      console.error('❌ Failed to handle encrypted request:', err);
      setError(err instanceof Error ? err.message : 'Failed to decrypt request');
      setState('error');
    }
  };

  // ==========================================
  // SDK MODE - When opened by Coinbase SDK
  // ==========================================
  if (isSDKMode) {

    // Check if we have a pending transaction request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (pendingRequest?.type === SDKRequestType.SEND_TRANSACTION &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')) {

      // Extract transaction data with type safety
      let txData: TransactionRequestData;
      try {
        txData = extractTransactionData(
          pendingRequest.method,
          pendingRequest.params,
          pendingRequest.chain
        );
      } catch (err) {
        console.error('❌ Failed to extract transaction data:', err);
        setError(err instanceof Error ? err.message : 'Invalid transaction parameters');
        setState('error');
        return null;
      }

      return (
        <TransactionModal
          transactionRequest={txData}
          chain={pendingRequest.chain as chain}
          onSuccess={async (result: TransactionResult) => {
            setState('processing');
            try {
              // Type-safe result handling based on method
              let response: WalletSendCallsReturn | EthSendTransactionReturn;

              if (txData.method === 'wallet_sendCalls') {
                // EIP-5792: Return sendCallsId for wallet_sendCalls
                response = {
                  id: result.id  || `0x${'0'.repeat(64)}`,
                  chainId: result.chainId as number,
                  // capabilities can be included if supported by the wallet
                } satisfies WalletSendCallsReturn ;
              } else {
                // eth_sendTransaction: Return transaction hash
                response = (result.hash || `0x${'0'.repeat(64)}`) as EthSendTransactionReturn;
              }

              console.log('✅ Transaction response:', response);
              await pendingRequest.onApprove(response);
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to send transaction:', err);
              setError(err instanceof Error ? err.message : 'Failed to send transaction');
              setState('error');
            }
          }}
          onError={async (error) => {
            try {
              const errorMessage = error instanceof Error ? error.message : String(error);
              await pendingRequest.onReject(errorMessage);
              setTimeout(() => window.close(), 1500);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              const rejectMessage = err instanceof Error ? err.message : 'Failed to reject request';
              setError(rejectMessage);
              setTimeout(() => window.close(), 1500);
              window.close();
            }
          }}
        />
      );
    }

    // Check if we have a pending sign message request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (pendingRequest?.type === SDKRequestType.SIGN_MESSAGE &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')) {
      // Extract message and address based on method type
      let messageToSign: string;
      let address: string | undefined;

      if (pendingRequest.method === 'wallet_sign') {
        // wallet_sign: params[0] is SignParams object
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signParams = pendingRequest.params[0] as { request: { type: string; data: any }; address?: string };
        messageToSign = typeof signParams?.request?.data === 'string' ? signParams.request.data : String(signParams?.request?.data || '');
        address = signParams?.address;
      } else {
        // personal_sign: params[0] is message, params[1] is address
        messageToSign = pendingRequest.params[0] as string;
        address = pendingRequest.params[1] as string;
      }

      return (
        <SignatureModal
          origin={pendingRequest.origin}
          // open={true}
          // onOpenChange={() => { }}
          message={messageToSign}
          address={address}
          chain={pendingRequest.chain as chain}
          onSuccess={async (signature, message) => {
            setState('processing');
            try {
              await pendingRequest.onApprove(signature);
              console.log('✅ Signature sent successfully');
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to send signature:', err);
              setError(err instanceof Error ? err.message : 'Failed to send signature');
              setState('error');
            }
          }}
          onError={async (error) => {
            try {
              await pendingRequest.onReject(error.message);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
      );
    }

    // Show loading while initializing or checking passkeys
    if (state === 'initializing' || state === 'passkey-check') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">
              {state === 'initializing' && 'Connecting to dApp...'}
              {state === 'passkey-check' && 'Checking for passkeys...'}
            </p>
            {config && (
              <p className="text-sm text-gray-500 mt-2">
                SDK v{config.version}
              </p>
            )}
          </div>
        </div>
      );
    }

    // Show processing spinner
    if (state === 'processing') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md p-6">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {authQuery.isAuthenticated ? 'Connecting to dApp...' : 'Processing...'}
            </h3>
            <p className="text-gray-600 mb-4">
              {authQuery.isAuthenticated && authQuery.accountName
                ? `Authenticated as ${authQuery.accountName}. Waiting for dApp connection...`
                : 'Please wait while we process your request.'
              }
            </p>
            {config?.metadata && (
              <p className="text-sm text-gray-500">
                {config.metadata.appName}
              </p>
            )}
          </div>
        </div>
      );
    }

    // Show success state
    if (state === 'success') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Success!</h3>
            <p className="text-gray-600">Operation completed successfully</p>
          </div>
        </div>
      );
    }

    // Show error state
    if (state === 'error') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md p-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error || 'An error occurred'}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setError(null);
                  setState('passkey-check');
                  checkForPasskeys();
                }}
                className="w-full py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.close()}
                className="w-full py-2 px-6 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Show passkey creation screen
    if (state === 'passkey-create') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Create Your Passkey
              </h2>
              <p className="text-gray-600">
                Create a passkey to securely access your wallet
              </p>
            </div>

            <SignInScreen
              ensConfig={ensConfig}
              chainId={chainId}
              apiKey={apiKey}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              onComplete={async () => {
                try {

                  // SignInScreen already created the passkey, just refetch and proceed
                  const accountsResult = await passkeyQuery.refetchAccounts();

                  await authQuery.refetch();

                  const accounts = accountsResult.data || [];
                  const newestAccount = accounts[accounts.length - 1] || null;
                  setCurrentAccount(newestAccount);

                  // If there's a pending connect request, show approval screen immediately
                  if (pendingRequest?.type === SDKRequestType.CONNECT) {
                    setState('account-selection');
                  } else if (pendingRequest?.type === SDKRequestType.SIGN_MESSAGE || pendingRequest?.type === SDKRequestType.SEND_TRANSACTION) {
                    // If there's a pending sign message or transaction request, the modal will be shown
                    // in the priority logic above since user is now authenticated
                    setState('processing');
                  } else {
                    // No pending request yet, stay on current screen and wait for it
                    // useEffect will handle transition when handshake arrives
                    // Don't change state - stay on passkey-create to keep UI visible
                  }
                } catch (err) {
                  console.error('❌ Failed after passkey creation:', err);
                  setError(err instanceof Error ? err.message : 'Failed to proceed');
                  setState('error');
                }
              }}
            />

            <button
              onClick={() => window.close()}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Show passkey authentication screen
    if (state === 'passkey-auth') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Welcome Back
              </h2>
              <p className="text-gray-600">
                Use your passkey to access your wallet
              </p>
            </div>

            <SignInScreen
              ensConfig={ensConfig}
              chainId={chainId}
              apiKey={apiKey}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              onComplete={async () => {
                try {
                  const accountsResult = await passkeyQuery.refetchAccounts();

                  await authQuery.refetch();

                  const accounts = accountsResult.data || [];
                  setCurrentAccount(accounts[0] || null);

                  // If there's a pending connect request, show approval screen immediately
                  if (pendingRequest?.type === SDKRequestType.CONNECT) {
                    setState('account-selection');
                  } else if (pendingRequest?.type === SDKRequestType.SIGN_MESSAGE || pendingRequest?.type === SDKRequestType.SEND_TRANSACTION) {
                    // If there's a pending sign message or transaction request, the modal will be shown
                    // in the priority logic above since user is now authenticated
                    setState('processing');
                  } else {
                    // No pending request yet, stay on current screen and wait for it
                    // useEffect will handle transition when handshake arrives
                    // Don't change state - stay on passkey-auth to keep UI visible
                  }
                } catch (err) {
                  console.error('❌ Failed after authentication:', err);
                  setError(err instanceof Error ? err.message : 'Authentication failed');
                  setState('passkey-auth');
                }
              }}
            />

            <button
              onClick={() => window.close()}
              className="w-full mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    // Show connection approval (account-selection state)
    if (state === 'account-selection' && pendingRequest?.type === SDKRequestType.CONNECT) {
      const { metadata } = pendingRequest;

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
            <div className="text-center mb-6">
              {metadata?.appLogoUrl && (
                <img
                  src={metadata.appLogoUrl}
                  alt={metadata.appName}
                  className="w-16 h-16 mx-auto mb-3 rounded-full"
                />
              )}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Connect to {metadata?.appName || 'dApp'}
              </h2>
              <p className="text-gray-600">
                This app wants to connect to your wallet
              </p>
            </div>

            {currentAccount && authQuery.isAuthenticated && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Account:</span>
                  <span className="font-medium text-gray-900">{authQuery.accountName || currentAccount.username}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Address:</span>
                  <span className="font-mono text-xs font-medium text-gray-900">
                    {authQuery.walletAddress?.slice(0, 6)}...{authQuery.walletAddress?.slice(-4)}
                  </span>
                </div>
                {metadata && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Chains:</span>
                    <span className="font-medium text-gray-900">
                      {metadata.appChainIds.length} chains
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={async () => {
                  setState('processing');
                  try {
                    console.log('✅ User approved connection');
                    await pendingRequest.onApprove([authQuery.walletAddress || '0x0000000000000000000000000000000000000000']);
                    setState('success');
                    setTimeout(() => window.close(), 1500);
                  } catch (err) {
                    console.error('❌ Failed to approve connection:', err);
                    setError(err instanceof Error ? err.message : 'Failed to approve connection');
                    setState('error');
                  }
                }}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
              >
                Connect Wallet
              </button>
              <button
                onClick={async () => {
                  try {
                    await pendingRequest.onReject('User rejected connection');
                    window.close();
                  } catch (err) {
                    console.error('❌ Failed to reject:', err);
                    window.close();
                  }
                }}
                className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    // No pending request yet - should not normally be seen
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Waiting for request...</p>
        </div>
      </div>
    );
  }

  return null;
}
