'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth, usePasskeys } from '../hooks';
import { SignInScreen } from '../components/OnboardingSection';
import { SignatureModal } from '../components/SignatureModal';
import { SiweModal } from '../components/SiweModal';
import { Eip712Modal } from '../components/Eip712Modal';
import { ensureIntNumber, type SignInWithEthereumCapabilityRequest } from '@jaw.id/core';
import { ConnectModal } from '../components/ConnectModal';
import { TransactionModal, type TransactionResult, type TransactionRequestData } from '../components/TransactionModal';
import { PermissionModal, type PermissionRequestData } from '../components/PermissionModal';
import { UnsupportedMethodModal } from '../components/UnsupportedMethodModal';
import { SDKRequestType } from '../lib/sdk-types';
import { Account, type PasskeyAccount } from '@jaw.id/core';
import { PopupCommunicator, type Message } from '../lib/popup-communicator';
import { CryptoHandler } from '../lib/crypto-handler';
import type { SessionAuthState } from '../lib/session-manager';
import type { RPCRequestMessage } from '@jaw.id/core';
import type { Chain as chain } from '@jaw.id/core';
import { extractTransactionData, type WalletSendCallsReturn, type EthSendTransactionReturn } from '../lib/tx-handler';
import { isSiweMessage } from '../lib/siwe-handler';
import { createSiweMessage } from 'viem/siwe';
import { ChainId } from '@justaname.id/sdk';
import type { PopupConfig, PendingRequest } from '../utils/types';
import { extractSubnameTextRecords } from '../lib/extractSubnameTexts';
import { standardErrorCodes } from '@jaw.id/core';


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
  // Current origin for session-based auth
  const [currentOrigin, setCurrentOrigin] = useState<string | null>(null);

  // Use hooks for passkey operations (pass origin for session-based auth)
  const authQuery = useAuth({ origin: currentOrigin || undefined });
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
  const effectiveChainId = (chainId ?? pendingRequest?.chain?.id ?? 1) as ChainId;

  const configRef = useRef<PopupConfig | null>(null);

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
        configRef.current = message.data;

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

  // Handle eth_chainId request (no UI needed, respond directly)
  useEffect(() => {
    if (pendingRequest?.type === SDKRequestType.CHAIN_ID && isSDKMode) {
      const handleChainId = async () => {
        try {
          const chainId = pendingRequest.chain?.id ?? 1;
          const chainIdHex = `0x${chainId.toString(16)}`;
          await pendingRequest.onApprove(chainIdHex);
          setTimeout(() => window.close(), 100);
        } catch (error) {
          console.error('❌ Failed to handle eth_chainId:', error);
          await pendingRequest.onReject(
            error instanceof Error ? error.message : 'Failed to get chain ID',
            standardErrorCodes.rpc.internal
          );
          setTimeout(() => window.close(), 100);
        }
      };
      handleChainId();
    }
  }, [pendingRequest, isSDKMode]);

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
      if (!('handshake' in request.content) || !request.content.handshake) {
        console.error('❌ Invalid handshake request');
        return;
      }

      // Get origin and set it as current context
      const origin = communicator.getOrigin() || '';
      setCurrentOrigin(origin);
      cryptoHandler.setOrigin(origin);

      const peerPublicKey = request.sender;
      const method = request.content.handshake.method;
      const params = request.content.handshake.params;
      const chain = request.content.chain;

      console.log('🔍 =========================');
      console.log('🔍 HANDSHAKE REQUEST RECEIVED:');
      console.log('🔍 Origin:', origin);
      console.log('🔍 Method:', method);
      console.log('🔍 =========================');

      const apiKeyFromProvider = request.content?.chain?.rpcUrl?.split('api-key=')[1];
      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // Check for existing session
      const existingSession = cryptoHandler.getSession(origin);

      // For pure key exchange handshake (method: 'handshake')
      if (method === 'handshake') {
        if (existingSession && existingSession.peerPublicKey !== peerPublicKey) {
          // Update peer key if changed
          await cryptoHandler.getSessionManager().updatePeerKey(origin, peerPublicKey);
        }
        // For key exchange without session, we can't create one yet (no account)
        // Just acknowledge the handshake
        const response = await cryptoHandler.createHandshakeResponse(request.id, { accounts: [] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        communicator.sendMessage(response as unknown as Message);
        return;
      }

      // For eth_requestAccounts and wallet_connect
      if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
        // Always create a fresh session with new keys for each connection request
        if (existingSession) {
          console.log('🗑️ Deleting old session for:', origin);
          cryptoHandler.getSessionManager().deleteSession(origin);
        }

        // Create new session with fresh keys (account will be set when user approves)
        console.log('🔐 Creating fresh session for:', origin);
        await cryptoHandler.getSessionManager().createSession({
          origin,
          peerPublicKey,
        });

        // Reload session after creation
        cryptoHandler.loadSession(origin);

        // Set up pending request (for both new connections and SIWE)
        setPendingRequest({
          origin,
          type: SDKRequestType.CONNECT,
          requestId: request.id || '',
          correlationId: request.correlationId || '',
          metadata: configRef.current?.metadata || null,
          method,
          params: Array.isArray(params) ? params : [],
          chain: chain ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) } : undefined,
          onApprove: async (result: unknown) => {
            const response = await cryptoHandler.createHandshakeResponse(
              request.id,
              result as { accounts: Array<{ address: string; capabilities?: Record<string, unknown> }> }
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(response as any);
          },
          onReject: async () => {
            window.close();
          },
        });

        // Fresh session has no account - checkForPasskeys flow will handle passkey creation/selection
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
      // Get origin and load session
      const origin = communicator.getOrigin() || '';
      setCurrentOrigin(origin);

      // Load the session for this origin
      const session = cryptoHandler.loadSession(origin);

      if (!session || !session.authState) {
        console.error('❌ No authenticated session found for origin:', origin);
        setError('No authenticated session found. Please reconnect.');
        setState('error');
        return;
      }

      // Verify and update peer key if needed
      const isValid = await cryptoHandler.verifyAndUpdatePeerKey(request);
      if (!isValid) {
        console.error('❌ Failed to verify peer key');
        setError('Session verification failed. Please reconnect.');
        setState('error');
        return;
      }

      // Set current account from session
      setCurrentAccount({
        username: session.authState.username,
        credentialId: session.authState.credentialId,
        publicKey: session.authState.publicKey,
        creationDate: new Date().toISOString(),
        isImported: false,
      });

      // Decrypt the request
      const decrypted = await cryptoHandler.decryptRequest(request);

      const method = decrypted.action.method;
      const params = decrypted.action.params;
      const chain = decrypted.chain;

      // Extract API key from chain rpcUrl if present
      const apiKeyFromProvider = chain?.rpcUrl?.split('api-key=')[1];
      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // Determine request type and show appropriate UI
      let requestType: SDKRequestType;

      // Check for sign message requests
      // personal_sign: always a sign message request
      // wallet_sign: only if request.type === "0x45" (Personal Sign per EIP-191)
      if (method === 'personal_sign' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === "0x45")) {
        requestType = SDKRequestType.SIGN_MESSAGE;
      } else if (method === 'eth_signTypedData_v4' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === "0x01")) {
        requestType = SDKRequestType.SIGN_TYPED_DATA;
      } else if (method === 'wallet_sendCalls' || method === 'eth_sendTransaction') {
        requestType = SDKRequestType.SEND_TRANSACTION;
      } else if (method === 'eth_chainId') {
        requestType = SDKRequestType.CHAIN_ID;
      } else if (method === 'wallet_grantPermissions') {
        requestType = SDKRequestType.GRANT_PERMISSIONS;
      } else if (method === 'wallet_revokePermissions') {
        requestType = SDKRequestType.REVOKE_PERMISSIONS;
      } else if (method === 'wallet_connect') {
        requestType = SDKRequestType.CONNECT;
      } else {
        console.warn('⚠️ Unsupported method:', method);
        requestType = SDKRequestType.UNSUPPORTED_METHOD;
      }

      setPendingRequest({
        origin,
        type: requestType,
        requestId: request.id || '',
        correlationId: request.correlationId || '',
        metadata: configRef.current?.metadata || null,
        method,
        params: Array.isArray(params) ? params : [],
        chain: chain ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) } : undefined,
        onApprove: async (result: unknown) => {
          const response = await cryptoHandler.createEncryptedResponse(
            request.id || '',
            request.correlationId || '',
            result
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communicator.sendMessage(response as any);
        },
        onReject: async (error: string, errorCode?: number) => {
          try {
            const errorResponse = await cryptoHandler.createEncryptedErrorResponse(
              request.id || '',
              request.correlationId || '',
              errorCode ?? standardErrorCodes.provider.userRejectedRequest,
              error || 'User rejected the request'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(errorResponse as any);
            setTimeout(() => window.close(), 100);
          } catch (err) {
            console.error('❌ Failed to send rejection response:', err);
            window.close();
          }
        },
      });

      // For sign message, typed data, transaction, and permission requests, if we have a session, show modal directly
      if ((requestType === SDKRequestType.SIGN_MESSAGE ||
           requestType === SDKRequestType.SIGN_TYPED_DATA ||
           requestType === SDKRequestType.SEND_TRANSACTION ||
           requestType === SDKRequestType.GRANT_PERMISSIONS ||
           requestType === SDKRequestType.REVOKE_PERMISSIONS) && session) {
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
          origin={pendingRequest.origin}
          transactionRequest={txData}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey}
          onSuccess={async (result: TransactionResult) => {
            setState('processing');
            try {
              // Type-safe result handling based on method
              let response: WalletSendCallsReturn | EthSendTransactionReturn;

              if (txData.method === 'wallet_sendCalls') {
                // EIP-5792: Return sendCallsId for wallet_sendCalls
                response = {
                  id: result.id || `0x${'0'.repeat(64)}`,
                  chainId: result.chainId as number,
                  // capabilities can be included if supported by the wallet
                } satisfies WalletSendCallsReturn;
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
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
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
        // ERC-7871: For type 0x45, data is { message: string }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signParams = pendingRequest.params[0] as { request: { type: string; data: { message: string } }; address?: string };
        messageToSign = signParams?.request?.data?.message || '';
        address = signParams?.address;
      } else {
        // personal_sign: params[0] is message, params[1] is address
        messageToSign = pendingRequest.params[0] as string;
        address = pendingRequest.params[1] as string;
      }

      // Check if this is a SIWE (Sign-In with Ethereum) message
      const isSiwe = isSiweMessage(messageToSign);

      // Render SiweModal for SIWE messages, SignatureModal for regular messages
      if (isSiwe) {
        return (
          <SiweModal
            origin={pendingRequest.origin}
            message={messageToSign}
            address={address}
            chain={pendingRequest.chain as chain}
            apiKey={apiKey}
            appName={pendingRequest.metadata?.appName || 'dApp'}
            appLogoUrl={pendingRequest.metadata?.appLogoUrl}
            onSuccess={async (signature, message) => {
              setState('processing');
              try {
                await pendingRequest.onApprove(signature);
                console.log('✅ SIWE signature sent successfully');
                setState('success');
                setTimeout(() => window.close(), 1500);
              } catch (err) {
                console.error('❌ Failed to send SIWE signature:', err);
                setError(err instanceof Error ? err.message : 'Failed to send signature');
                setState('error');
              }
            }}
            onError={async (error, errorCode) => {
              try {
                // Forward error and code directly from modal
                await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
                window.close();
              } catch (err) {
                console.error('❌ Failed to reject:', err);
                window.close();
              }
            }}
          />
        );
      }

      return (
        <SignatureModal
          origin={pendingRequest.origin}
          // open={true}
          // onOpenChange={() => { }}
          message={messageToSign}
          address={address}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey}
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
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
      );
    }

    // Check if we have a pending EIP-712 typed data signing request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')) {
      // Extract typed data JSON and address based on method type
      let address: string | undefined;
      let typedDataJson: string;

      if (pendingRequest.method === 'wallet_sign') {
        // ERC-7871: For type 0x01, data is the TypedData object directly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signParams = pendingRequest.params[0] as { request: { type: string; data: Record<string, unknown> }; address?: string };

        const data = signParams?.request?.data;
        typedDataJson = typeof data === 'string' ? data : JSON.stringify(data);

        address = signParams?.address;

        console.log('🔍 wallet_sign EIP-712 Request:', { type: signParams?.request?.type, address, typedDataJson });
      } else {
        // eth_signTypedData_v4: params[0] is address, params[1] is typed data JSON string
        address = pendingRequest.params[0] as string;
        typedDataJson = pendingRequest.params[1] as string;

        console.log('🔍 eth_signTypedData_v4 Request:', { address, typedDataJson });
      }

      return (
        <Eip712Modal
          origin={pendingRequest.origin}
          typedDataJson={typedDataJson}
          address={address}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey}
          onSuccess={async (signature) => {
            setState('processing');
            try {
              await pendingRequest.onApprove(signature);
              console.log('✅ Typed data signature sent successfully');
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to send signature:', err);
              setError(err instanceof Error ? err.message : 'Failed to send signature');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
      );
    }

    // Check if we have a pending grant permissions request and either user is authenticated OR we're in processing state
    if (pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')) {

      const permissionRequestData: PermissionRequestData = {
        method: 'wallet_grantPermissions',
        params: pendingRequest.params as any,
      };

      return (
        <PermissionModal
          permissionRequest={permissionRequestData}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey || ''}
          origin={pendingRequest.origin}
          onSuccess={async (result) => {
            setState('processing');
            try {
              await pendingRequest.onApprove(result);
              console.log('✅ Permission granted successfully');
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to grant permission:', err);
              setError(err instanceof Error ? err.message : 'Failed to grant permission');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
      );
    }

    // Check if we have a pending revoke permissions request and either user is authenticated OR we're in processing state
    if (pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')) {

      const permissionRequestData: PermissionRequestData = {
        method: 'wallet_revokePermissions',
        params: pendingRequest.params as any,
      };

      return (
        <PermissionModal
          permissionRequest={permissionRequestData}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey || ''}
          origin={pendingRequest.origin}
          onSuccess={async (result) => {
            setState('processing');
            try {
              await pendingRequest.onApprove(result);
              console.log('✅ Permission revoked successfully');
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to revoke permission:', err);
              setError(err instanceof Error ? err.message : 'Failed to revoke permission');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
      );
    }

    // Show unsupported method modal
    if (!!pendingRequest && pendingRequest?.type === SDKRequestType.UNSUPPORTED_METHOD) {
      return (
        <UnsupportedMethodModal
          origin={pendingRequest.origin}
          method={pendingRequest.method}
          appName={pendingRequest.metadata?.appName}
          appLogoUrl={pendingRequest.metadata?.appLogoUrl}
          onClose={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.rpc.methodNotFound);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject unsupported method:', err);
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
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
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
                  } else if (
                    pendingRequest?.type === SDKRequestType.SIGN_MESSAGE ||
                    pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA ||
                    pendingRequest?.type === SDKRequestType.SEND_TRANSACTION ||
                    pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS ||
                    pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS
                  ) {
                    // If there's a pending sign message, typed data, transaction, or permission request,
                    // the modal will be shown in the priority logic above since user is now authenticated
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
            <SignInScreen
              ensConfig={ensConfig}
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
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
                  } else if (
                    pendingRequest?.type === SDKRequestType.SIGN_MESSAGE ||
                    pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA ||
                    pendingRequest?.type === SDKRequestType.SEND_TRANSACTION ||
                    pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS ||
                    pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS
                  ) {
                    // If there's a pending sign message, typed data, transaction, or permission request,
                    // the modal will be shown in the priority logic above since user is now authenticated
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
          </div>
        </div>
      );
    }

    // Show connection approval (account-selection state)
    if (state === 'account-selection' && pendingRequest?.type === SDKRequestType.CONNECT) {
      // Extract signInWithEthereum capability from wallet_connect params
      // params structure: [{ capabilities?: { signInWithEthereum?: {...} } }]
      const walletConnectParams = pendingRequest.params as [{ capabilities?: { signInWithEthereum?: SignInWithEthereumCapabilityRequest } }] | undefined;
      const signInWithEthereumCapability = walletConnectParams?.[0]?.capabilities?.signInWithEthereum;

      // Get wallet address from session or compute from current account
      // During connection, session.authState isn't set yet, so we fallback to global authState
      // (which is safe since popup handles one connection at a time)
      const walletAddress = authQuery.walletAddress || Account.getAuthenticatedAddress(apiKey);
      if (!walletAddress) {
        // Reject with internal error (JSON-RPC code -32603)
        pendingRequest.onReject('Internal error: wallet address not available', standardErrorCodes.rpc.internal);
        return null;
      }

      // If SIWE capability is requested, show SiweModal instead of ConnectModal
      if (signInWithEthereumCapability && pendingRequest.chain) {
        // Build the SIWE message using viem's createSiweMessage
        const buildSiweMessageFromCapability = () => {
          const origin = pendingRequest.origin;
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
            address: walletAddress as `0x${string}`,
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
        };

        const siweMessage = buildSiweMessageFromCapability();

        return (
          <SiweModal
            origin={pendingRequest.origin}
            message={siweMessage}
            address={walletAddress}
            chain={pendingRequest.chain}
            appName={pendingRequest.metadata?.appName}
            appLogoUrl={pendingRequest.metadata?.appLogoUrl}
            onSuccess={async (signature: string, message: string) => {
              setState('processing');
              try {
                console.log('✅ User signed SIWE message');

                // Update session with authState (session was created during handshake)
                const sessionAuthState: SessionAuthState = {
                  address: walletAddress as `0x${string}`,
                  credentialId: currentAccount?.credentialId || authQuery.credentialId || '',
                  username: currentAccount?.username || authQuery.accountName || '',
                  publicKey: currentAccount?.publicKey || '0x',
                };

                cryptoHandler.updateAuthState(sessionAuthState);
                console.log('✅ Session authState updated for:', pendingRequest.origin);

                // Build response per ERC-7846 format with SIWE capability
                const response = {
                  accounts: [{
                    address: walletAddress,
                    capabilities: {
                      signInWithEthereum: {
                        message,
                        signature: signature as `0x${string}`
                      }
                    }
                  }]
                };

                console.log('✅ SIWE response:', response);
                await pendingRequest.onApprove(response);
                setState('success');
                setTimeout(() => window.close(), 1500);
              } catch (err) {
                console.error('❌ Failed to approve connection with SIWE:', err);
                setError(err instanceof Error ? err.message : 'Failed to approve connection');
                setState('error');
              }
            }}
            onError={async (error, errorCode) => {
              try {
                // Forward error and code directly from modal
                await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
                window.close();
              } catch (err) {
                console.error('❌ Failed to reject:', err);
                window.close();
              }
            }}
          />
        );
      }

      // No SIWE capability - show regular ConnectModal
      return (
        <ConnectModal
          origin={pendingRequest.origin}
          appName={pendingRequest.metadata?.appName || 'dApp'}
          appLogoUrl={pendingRequest.metadata?.appLogoUrl}
          accountName={authQuery.accountName || currentAccount?.username}
          walletAddress={walletAddress}
          chain={pendingRequest.chain}
          onSuccess={async () => {
            setState('processing');
            try {
              console.log('✅ User approved connection');

              // Update session with authState (session was created during handshake)
              const sessionAuthState: SessionAuthState = {
                address: walletAddress as `0x${string}`,
                credentialId: currentAccount?.credentialId || authQuery.credentialId || '',
                username: currentAccount?.username || authQuery.accountName || '',
                publicKey: currentAccount?.publicKey || '0x',
              };

              cryptoHandler.updateAuthState(sessionAuthState);
              console.log('✅ Session authState updated for:', pendingRequest.origin);

              // Build response per ERC-7846 format (no capabilities)
              const response = {
                accounts: [{
                  address: walletAddress
                }]
              };

              await pendingRequest.onApprove(response);
              setState('success');
              setTimeout(() => window.close(), 1500);
            } catch (err) {
              console.error('❌ Failed to approve connection:', err);
              setError(err instanceof Error ? err.message : 'Failed to approve connection');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(error.message, errorCode ?? standardErrorCodes.provider.userRejectedRequest);
              window.close();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              window.close();
            }
          }}
        />
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
