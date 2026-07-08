'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { debugLog } from '../lib/debug-log';
import { useAuth, usePasskeys } from '../hooks';
import { SignInScreen, type AuthenticatedAccount } from '../components/OnboardingSection';
import { type PasskeyAccount } from '@jaw.id/core';
import { SignatureModal } from '../components/SignatureModal';
import { SiweModal } from '../components/SiweModal';
import { Eip712Modal } from '../components/Eip712Modal';
import { ensureIntNumber, type SignInWithEthereumCapabilityRequest } from '@jaw.id/core';
import { ConnectModal } from '../components/ConnectModal';
import { TransactionModal, type TransactionResult, type TransactionRequestData } from '../components/TransactionModal';
import { PermissionModal, type PermissionRequestData } from '../components/PermissionModal';
import { OnrampModal } from '../components/OnrampModal';
import type { OnrampOrder, OnrampParams } from '@jaw.id/core';
import { UnsupportedMethodModal } from '../components/UnsupportedMethodModal';
import { SDKRequestType } from '../lib/sdk-types';
import { PopupCommunicator, type Message } from '../lib/popup-communicator';
import { EmbeddedShell } from '../components/EmbeddedShell';
import { CryptoHandler } from '../lib/crypto-handler';
import type { SessionAuthState } from '../lib/session-manager';
import type { RPCRequestMessage, RPCResponseMessage, MessageID } from '@jaw.id/core';
import { RECONNECT_REQUIRED } from '@jaw.id/core';
import type { Chain as chain } from '@jaw.id/core';
import { extractTransactionData, type WalletSendCallsReturn, type EthSendTransactionReturn } from '../lib/tx-handler';
import { isSiweMessage, parseSiweMessage, getSiweOriginWarning } from '@jaw.id/ui';
import { applyDappTheme } from '../lib/apply-dapp-theme';
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

// Delay before closing the dialog once a flow completes. The response is
// already posted to the SDK *before* this timer starts (each flow does
// `await onApprove(...)` then `scheduleClose(...)`), and a 'completed'
// DialogClose never rejects a pending request — so this is purely event-loop
// margin to let the SDK drain the result ahead of the close, not a round-trip
// budget. 300ms stays effectively instant while giving a busy main thread
// comfortable headroom.
const CLOSE_DELAY_MS = 300;

export default function KeysJawIdApp() {
  // Single communicator instance, shared by the embedded shell (presentation
  // + iframe escape hatches) and the app content (message flow).
  const [communicator] = useState(() => new PopupCommunicator());

  return (
    <EmbeddedShell communicator={communicator}>
      <KeysJawIdAppContent communicator={communicator} />
    </EmbeddedShell>
  );
}

function KeysJawIdAppContent({ communicator }: { communicator: PopupCommunicator }) {
  // Current origin for session-based auth
  const [currentOrigin, setCurrentOrigin] = useState<string | null>(null);

  // Use hooks for passkey operations (pass origin for session-based auth)
  const authQuery = useAuth({ origin: currentOrigin || undefined });
  const passkeyQuery = usePasskeys();

  // Service instances (created once)
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
  // Mirrors `state` so the (once-registered) message listener can read the
  // CURRENT state without a stale closure. Updated on every render.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Holds the pending success→close timer so a new flow can cancel a previous
  // flow's auto-close (the embedded iframe stays mounted across flows).
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Schedule the dialog close after a flow completes. Cancelable: starting a new
   * flow clears any pending close so a prior flow's timer can't hide the dialog
   * mid-request (which, with no business-request timeout, would hang the dApp).
   */
  const scheduleClose = useCallback(
    (ms: number) => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        communicator.requestClose();
      }, ms);
    },
    [communicator]
  );

  // Single useEffect for all message handling
  useEffect(() => {
    // Check if running in popup mode
    if (!communicator.hasOpener()) {
      debugLog('📱 Running in normal mode (no opener)');
      setIsSDKMode(false);
      return;
    }

    debugLog('🚀 Running in SDK popup mode');
    setIsSDKMode(true);

    // Initialize crypto handler
    cryptoHandler
      .initialize()
      .then(() => {
        debugLog('✅ CryptoHandler initialized');
        // Send PopupLoaded event
        communicator.sendPopupLoaded();
      })
      .catch((err) => {
        console.error('❌ Failed to initialize CryptoHandler:', err);
        setError('Failed to initialize');
        setState('error');
      });

    // Listen for messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cleanup = communicator.onMessage<PopupConfig>((message: any) => {
      // Log only the message shape, never the full payload — it includes the
      // embedder URL, metadata and the encrypted envelope (visible to any
      // extension with console access).
      debugLog('📥 Received message:', message?.event ?? (message?.requestId ? 'response' : 'request'));

      // Handle config message
      if (message.data?.version) {
        setConfig(message.data);
        configRef.current = message.data;

        setEnsConfig(message.data.preference?.ens);
        setChainId(message.data.metadata?.defaultChainId as ChainId);
        setApiKey(message.data.apiKey);

        // Apply the dApp's theme tokens so the embedded dialog matches its
        // look & feel (accent color, border radius, light/dark), translated
        // into keys' own shadcn-HSL token system. Falls back to the OS theme
        // (SystemThemeListener) when no theme is sent.
        if (message.data.theme) {
          applyDappTheme(message.data.theme);
        }

        // Always show account selection UI - never auto-authenticate
        checkForPasskeys();

        communicator.sendPopupReady(message.requestId);
      }

      // Live theme update: the dApp pushed a new theme (e.g. an OS light/dark
      // flip) without reconnecting. Re-apply it so the embedded dialog tracks
      // the host — this is what makes theme sync robust against the prewarm
      // one-shot. Same mapping as the config branch.
      if (message.event === 'SetTheme') {
        if (message.data?.theme) {
          applyDappTheme(message.data.theme);
        }
      }

      // Handle selectSignerType event
      if (message.event === 'selectSignerType') {
        communicator.sendResponse(message.id, 'scw');
      }

      // Handle RPC requests
      if (message.id && message.sender && message.content) {
        // The embedded iframe stays mounted across flows, so a previous flow may
        // have left a terminal state ('success'/'error'), a stale pendingRequest,
        // and a scheduled auto-close — none of which the popup ever hit (fresh
        // page per flow). Reset before handling the new request so it renders its
        // own UI and is not closed by the previous flow's timer. Read the live
        // state via a ref (the listener is registered once → stale closure).
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        // Terminal-only reset is sufficient: the SDK serializes requests (it
        // awaits each response), and keys sets the terminal state synchronously
        // right after sending the response — before the SDK can round-trip and
        // dispatch the next request. So by the time a new request arrives, the
        // prior flow is always already terminal. (A non-terminal in-progress
        // flow, e.g. a cold connect's passkey screen, must NOT be reset.)
        if (stateRef.current === 'success' || stateRef.current === 'error') {
          setError(null);
          setPendingRequest(null);
          setState('processing');
        }

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

    // Cleanup message listener on unmount (PopupUnload is handled by communicator's beforeunload)
    return () => {
      cleanup();
      // Don't let a scheduled close fire after unmount (dev hot-reload / nav).
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
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
          scheduleClose(CLOSE_DELAY_MS);
        } catch (error) {
          console.error('❌ Failed to handle eth_chainId:', error);
          await pendingRequest.onReject(
            error instanceof Error ? error.message : 'Failed to get chain ID',
            standardErrorCodes.rpc.internal
          );
          scheduleClose(CLOSE_DELAY_MS);
        }
      };
      handleChainId();
    }
  }, [pendingRequest, isSDKMode, scheduleClose]);

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

      debugLog('🔍 =========================');
      debugLog('🔍 HANDSHAKE REQUEST RECEIVED:');
      debugLog('🔍 Origin:', origin);
      debugLog('🔍 Method:', method);
      debugLog('🔍 =========================');

      const apiKeyFromProvider = request.content?.chain?.rpcUrl?.split('api-key=')[1];
      if (apiKeyFromProvider && apiKeyFromProvider !== apiKey) {
        setApiKey(apiKeyFromProvider);
      }

      // Check for existing session
      const existingSession = await cryptoHandler.getSession(origin);

      // For pure key exchange handshake (method: 'handshake')
      // This situation never happens because the wallet_connect/ eth_requestAccounts request is always sent first
      if (method === 'handshake') {
        if (!existingSession) {
          // No session yet - nothing to respond to, wait for wallet_connect
          debugLog('🔑 Handshake without session, waiting for wallet_connect');
          return;
        }
        if (existingSession.peerPublicKey !== peerPublicKey) {
          // Update peer key if changed
          await cryptoHandler.getSessionManager().updatePeerKey(origin, peerPublicKey);
        }
        // Acknowledge the handshake
        const response = await cryptoHandler.createHandshakeResponse(request.id, { accounts: [] });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        communicator.sendMessage(response as unknown as Message);
        return;
      }

      // For eth_requestAccounts and wallet_connect
      if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
        // Always create a fresh session with new keys for each connection request
        if (existingSession) {
          debugLog('🗑️ Deleting old session for:', origin);
          await cryptoHandler.getSessionManager().deleteSession(origin);
        }

        // Create new session with fresh keys (account will be set when user approves)
        debugLog('🔐 Creating fresh session for:', origin);
        await cryptoHandler.getSessionManager().createSession({
          origin,
          peerPublicKey,
        });

        // Reload session after creation
        await cryptoHandler.loadSession(origin);

        // Set up pending request (for both new connections and SIWE)
        setPendingRequest({
          origin,
          type: SDKRequestType.CONNECT,
          requestId: request.id || '',
          correlationId: request.correlationId || '',
          metadata: configRef.current?.metadata || null,
          method,
          params: Array.isArray(params) ? params : [],
          chain: chain
            ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) }
            : undefined,
          onApprove: async (result: unknown) => {
            const response = await cryptoHandler.createHandshakeResponse(
              request.id,
              result as { accounts: Array<{ address: string; capabilities?: Record<string, unknown> }> }
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(response as any);
          },
          onReject: async () => {
            communicator.requestClose();
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
      // Load session for this origin
      const origin = communicator.getOrigin() || '';

      // Update React state with current origin (needed for useAuth hook)
      setCurrentOrigin(origin);

      const session = await cryptoHandler.loadSession(origin);

      if (!session) {
        // Embedded (iframe) on Safari: storage partitioning isolates this frame
        // from the session a popup created during connect, so there is nothing to
        // decrypt with. Instead of dead-ending with a local error dialog, reply to
        // the SDK with a reconnect-required sentinel (tied to this request id, no
        // secret) so it re-establishes a session against this iframe and retries.
        if (communicator.isEmbedded()) {
          console.warn('⚠️ No session in iframe partition — requesting reconnect for origin:', origin);
          const reconnectResponse: RPCResponseMessage = {
            requestId: request.id,
            id: crypto.randomUUID() as MessageID,
            sender: '', // no session → no popup public key; this response carries no secret
            correlationId: request.correlationId,
            content: {
              failure: {
                code: standardErrorCodes.provider.disconnected,
                message: 'No session in this context; reconnect required',
                data: { reason: RECONNECT_REQUIRED },
              },
            },
            timestamp: new Date(),
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communicator.sendMessage(reconnectResponse as any);
          return;
        }
        console.error('❌ No session found for origin:', origin);
        throw new Error('No session found. Please reconnect.');
      }

      // Verify and update peer key if changed
      await cryptoHandler.verifyAndUpdatePeerKey(request);

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
      if (
        method === 'personal_sign' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === '0x45')
      ) {
        requestType = SDKRequestType.SIGN_MESSAGE;
      } else if (
        method === 'eth_signTypedData_v4' ||
        (method === 'wallet_sign' && Array.isArray(params) && params[0]?.request?.type === '0x01')
      ) {
        requestType = SDKRequestType.SIGN_TYPED_DATA;
      } else if (method === 'wallet_sendCalls' || method === 'eth_sendTransaction') {
        requestType = SDKRequestType.SEND_TRANSACTION;
      } else if (method === 'eth_chainId') {
        requestType = SDKRequestType.CHAIN_ID;
      } else if (method === 'wallet_grantPermissions') {
        requestType = SDKRequestType.GRANT_PERMISSIONS;
      } else if (method === 'wallet_revokePermissions') {
        requestType = SDKRequestType.REVOKE_PERMISSIONS;
      } else if (method === 'wallet_onramp') {
        requestType = SDKRequestType.ONRAMP;
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
        chain: chain
          ? { id: chain.id, rpcUrl: chain.rpcUrl ?? '', ...(chain.paymaster && { paymaster: chain.paymaster }) }
          : undefined,
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
          // Send standard error response (default: EIP-1193 code 4001)
          try {
            const errorResponse = await cryptoHandler.createEncryptedErrorResponse(
              request.id || '',
              request.correlationId || '',
              errorCode ?? standardErrorCodes.provider.userRejectedRequest, // Default to user rejected request (EIP-1193 standard)
              error || 'User rejected the request'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            communicator.sendMessage(errorResponse as any);
            // Close window after sending error
            scheduleClose(CLOSE_DELAY_MS);
          } catch (err) {
            console.error('❌ Failed to send rejection response:', err);
            communicator.requestClose();
          }
        },
      });

      // For sign message, typed data, transaction, and permission requests, if user is authenticated, show modal directly
      if (
        (requestType === SDKRequestType.SIGN_MESSAGE ||
          requestType === SDKRequestType.SIGN_TYPED_DATA ||
          requestType === SDKRequestType.SEND_TRANSACTION ||
          requestType === SDKRequestType.GRANT_PERMISSIONS ||
          requestType === SDKRequestType.REVOKE_PERMISSIONS ||
          requestType === SDKRequestType.ONRAMP) &&
        authQuery.isAuthenticated &&
        currentAccount
      ) {
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
  // SDK MODE
  // ==========================================
  if (isSDKMode) {
    // Check if we have a pending transaction request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (
      pendingRequest?.type === SDKRequestType.SEND_TRANSACTION &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
      // Extract transaction data with type safety
      let txData: TransactionRequestData;
      try {
        txData = extractTransactionData(pendingRequest.method, pendingRequest.params, pendingRequest.chain);
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
          apiKey={apiKey}
          origin={currentOrigin || undefined}
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

              debugLog('✅ Transaction response:', response);
              await pendingRequest.onApprove(response);
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to send transaction:', err);
              setError(err instanceof Error ? err.message : 'Failed to send transaction');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Onramp: fiat→crypto guest-checkout modal. No signature — delivers to the
    // connected account. Resolves with the normalized order.
    if (
      pendingRequest?.type === SDKRequestType.ONRAMP &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
      const onrampParams = (pendingRequest.params?.[0] ?? {}) as OnrampParams;
      return (
        <OnrampModal
          // The embedded iframe stays mounted across flows, so without a
          // per-request key React reuses the instance and a cancelled flow's
          // state (step, sessionId, payUrl) resurfaces on the next request.
          key={pendingRequest.requestId}
          onrampRequest={{ params: onrampParams }}
          chain={pendingRequest.chain as chain}
          apiKey={apiKey}
          origin={currentOrigin || undefined}
          onSuccess={async (order: OnrampOrder) => {
            setState('processing');
            try {
              await pendingRequest.onApprove(order);
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to complete onramp:', err);
              setError(err instanceof Error ? err.message : 'Failed to complete onramp');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Check if we have a pending sign message request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (
      pendingRequest?.type === SDKRequestType.SIGN_MESSAGE &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
      // Extract message and address based on method type
      let messageToSign: string;
      let address: string | undefined;

      if (pendingRequest.method === 'wallet_sign') {
        // wallet_sign: params[0] is SignParams object
        // ERC-7871: For type 0x45, data is { message: string }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signParams = pendingRequest.params[0] as {
          request: { type: string; data: { message: string } };
          address?: string;
        };
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
        const parsedSiwe = parseSiweMessage(messageToSign);
        const siweWarning = getSiweOriginWarning(pendingRequest.origin, {
          domain: parsedSiwe?.domain,
          uri: parsedSiwe?.uri,
        });
        return (
          <SiweModal
            origin={pendingRequest.origin}
            message={messageToSign}
            address={address}
            chain={pendingRequest.chain as chain}
            apiKey={apiKey}
            appName={pendingRequest.metadata?.appName || 'dApp'}
            appLogoUrl={pendingRequest.metadata?.appLogoUrl}
            warningMessage={siweWarning}
            onSuccess={async (signature, message) => {
              setState('processing');
              try {
                await pendingRequest.onApprove(signature);
                debugLog('✅ SIWE signature sent successfully');
                setState('success');
                scheduleClose(CLOSE_DELAY_MS);
              } catch (err) {
                console.error('❌ Failed to send SIWE signature:', err);
                setError(err instanceof Error ? err.message : 'Failed to send signature');
                setState('error');
              }
            }}
            onError={async (error, errorCode) => {
              try {
                // Forward error and code directly from modal
                await pendingRequest.onReject(
                  error.message,
                  errorCode ?? standardErrorCodes.provider.userRejectedRequest
                );
                communicator.requestClose();
              } catch (err) {
                console.error('❌ Failed to reject:', err);
                communicator.requestClose();
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
              debugLog('✅ Signature sent successfully');
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to send signature:', err);
              setError(err instanceof Error ? err.message : 'Failed to send signature');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Check if we have a pending EIP-712 typed data signing request and either user is authenticated OR we're in processing state
    // Don't show modal if state is 'success' or 'error' (request has been completed)
    if (
      pendingRequest?.type === SDKRequestType.SIGN_TYPED_DATA &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
      // Extract typed data JSON and address based on method type
      let address: string | undefined;
      let typedDataJson: string;

      if (pendingRequest.method === 'wallet_sign') {
        // ERC-7871: For type 0x01, data is the TypedData object directly
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const signParams = pendingRequest.params[0] as {
          request: { type: string; data: Record<string, unknown> };
          address?: string;
        };

        const data = signParams?.request?.data;
        typedDataJson = typeof data === 'string' ? data : JSON.stringify(data);

        address = signParams?.address;

        debugLog('🔍 wallet_sign EIP-712 Request:', { type: signParams?.request?.type, address, typedDataJson });
      } else {
        // eth_signTypedData_v4: params[0] is address, params[1] is typed data JSON string
        address = pendingRequest.params[0] as string;
        typedDataJson = pendingRequest.params[1] as string;

        debugLog('🔍 eth_signTypedData_v4 Request:', { address, typedDataJson });
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
              debugLog('✅ Typed data signature sent successfully');
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to send signature:', err);
              setError(err instanceof Error ? err.message : 'Failed to send signature');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Check if we have a pending grant permissions request and either user is authenticated OR we're in processing state
    if (
      pendingRequest?.type === SDKRequestType.GRANT_PERMISSIONS &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
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
              debugLog('✅ Permission granted successfully');
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to grant permission:', err);
              setError(err instanceof Error ? err.message : 'Failed to grant permission');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Check if we have a pending revoke permissions request and either user is authenticated OR we're in processing state
    if (
      pendingRequest?.type === SDKRequestType.REVOKE_PERMISSIONS &&
      state !== 'success' &&
      state !== 'error' &&
      (authQuery.isAuthenticated || state === 'processing')
    ) {
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
              debugLog('✅ Permission revoked successfully');
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to revoke permission:', err);
              setError(err instanceof Error ? err.message : 'Failed to revoke permission');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
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
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject unsupported method:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // Show loading while initializing or checking passkeys
    if (state === 'initializing' || state === 'passkey-check') {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2"></div>
            <p className="text-muted-foreground">
              {state === 'initializing' && 'Connecting to dApp...'}
              {state === 'passkey-check' && 'Checking for passkeys...'}
            </p>
            {config && <p className="text-muted-foreground mt-2 text-sm">SDK v{config.version}</p>}
          </div>
        </div>
      );
    }

    // Show processing spinner
    if (state === 'processing') {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md p-6 text-center">
            <div className="border-primary mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2"></div>
            <h3 className="text-foreground mb-2 text-xl font-semibold">
              {authQuery.isAuthenticated ? 'Connecting to dApp...' : 'Processing...'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {authQuery.isAuthenticated && authQuery.accountName
                ? `Authenticated as ${authQuery.accountName}. Waiting for dApp connection...`
                : 'Please wait while we process your request.'}
            </p>
            {config?.metadata && <p className="text-muted-foreground text-sm">{config.metadata.appName}</p>}
          </div>
        </div>
      );
    }

    // 'success' is a terminal marker only — it renders no UI. Each completed flow
    // closes the dialog immediately (see scheduleClose on every onSuccess),
    // matching the connect flow; the dApp surfaces its own confirmation. Keeping
    // the state (rather than dropping it) preserves the cross-flow reset sentinel
    // and the `state !== 'success'` modal-hide guards; returning null avoids a
    // success interstitial flashing during the brief close window.
    if (state === 'success') {
      return null;
    }

    // Show error state
    if (state === 'error') {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md p-6 text-center">
            <div className="bg-destructive/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <svg className="text-destructive h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-foreground mb-2 text-xl font-bold">Error</h3>
            <p className="text-muted-foreground mb-4">{error || 'An error occurred'}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setError(null);
                  setState('passkey-check');
                  checkForPasskeys();
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-6 py-2 font-semibold transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  communicator.sendPopupUnload();
                  communicator.requestClose();
                }}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 w-full rounded-lg px-6 py-2 font-semibold transition-colors"
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
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md">
            <SignInScreen
              ensConfig={ensConfig}
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              origin={currentOrigin || undefined}
              onComplete={async (authenticatedAccount: AuthenticatedAccount) => {
                try {
                  // Set the current account from the passed data
                  setCurrentAccount({
                    credentialId: authenticatedAccount.credentialId,
                    username: authenticatedAccount.username,
                    publicKey: authenticatedAccount.publicKey,
                    creationDate: new Date().toISOString(),
                    isImported: false,
                  });
                  // Update session auth state for per-origin isolation
                  if (currentOrigin) {
                    const authState: SessionAuthState = {
                      address: authenticatedAccount.address,
                      credentialId: authenticatedAccount.credentialId,
                      username: authenticatedAccount.username,
                      publicKey: authenticatedAccount.publicKey,
                    };
                    await cryptoHandler.updateAuthState(authState);
                    debugLog('✅ Session auth state updated for origin:', currentOrigin);
                  }

                  await authQuery.refetch();

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
          </div>
        </div>
      );
    }

    // Show passkey authentication screen
    if (state === 'passkey-auth') {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md">
            <SignInScreen
              ensConfig={ensConfig}
              chainId={effectiveChainId}
              apiKey={apiKey}
              chainConfig={pendingRequest?.chain}
              subnameTextRecords={extractSubnameTextRecords(pendingRequest)}
              origin={currentOrigin || undefined}
              onComplete={async (authenticatedAccount: AuthenticatedAccount) => {
                try {
                  // Set the current account from the passed data
                  setCurrentAccount({
                    credentialId: authenticatedAccount.credentialId,
                    username: authenticatedAccount.username,
                    publicKey: authenticatedAccount.publicKey,
                    creationDate: new Date().toISOString(),
                    isImported: false,
                  });

                  // Update session auth state for per-origin isolation
                  if (currentOrigin) {
                    const authState: SessionAuthState = {
                      address: authenticatedAccount.address,
                      credentialId: authenticatedAccount.credentialId,
                      username: authenticatedAccount.username,
                      publicKey: authenticatedAccount.publicKey,
                    };
                    await cryptoHandler.updateAuthState(authState);
                    // Do not log credentialId — it is sensitive (PII)
                    debugLog('✅ Session auth state updated for origin:', currentOrigin);
                  }

                  await authQuery.refetch();

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
      const walletConnectParams = pendingRequest.params as
        | [{ capabilities?: { signInWithEthereum?: SignInWithEthereumCapabilityRequest } }]
        | undefined;
      const signInWithEthereumCapability = walletConnectParams?.[0]?.capabilities?.signInWithEthereum;

      if (!authQuery.walletAddress) {
        // Reject with internal error (JSON-RPC code -32603)
        pendingRequest.onReject('Internal error: wallet address not available', standardErrorCodes.rpc.internal);
        return null;
      }
      const walletAddress = authQuery.walletAddress;

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
            issuedAt: signInWithEthereumCapability.issuedAt
              ? new Date(signInWithEthereumCapability.issuedAt)
              : new Date(),
            expirationTime: signInWithEthereumCapability.expirationTime
              ? new Date(signInWithEthereumCapability.expirationTime)
              : undefined,
            notBefore: signInWithEthereumCapability.notBefore
              ? new Date(signInWithEthereumCapability.notBefore)
              : undefined,
            requestId: signInWithEthereumCapability.requestId,
            resources: signInWithEthereumCapability.resources,
          });
        };

        const siweMessage = buildSiweMessageFromCapability();
        const siweWarning = getSiweOriginWarning(pendingRequest.origin, {
          domain: signInWithEthereumCapability.domain,
          uri: signInWithEthereumCapability.uri,
        });

        return (
          <SiweModal
            origin={pendingRequest.origin}
            message={siweMessage}
            address={walletAddress}
            chain={pendingRequest.chain}
            appName={pendingRequest.metadata?.appName}
            appLogoUrl={pendingRequest.metadata?.appLogoUrl}
            warningMessage={siweWarning}
            onSuccess={async (signature: string, message: string) => {
              setState('processing');
              try {
                debugLog('✅ User signed SIWE message');

                // Build response per ERC-7846 format with SIWE capability
                const response = {
                  accounts: [
                    {
                      address: walletAddress,
                      capabilities: {
                        signInWithEthereum: {
                          message,
                          signature: signature as `0x${string}`,
                        },
                      },
                    },
                  ],
                };

                debugLog('✅ SIWE response:', response);
                await pendingRequest.onApprove(response);
                setState('success');
                scheduleClose(CLOSE_DELAY_MS);
              } catch (err) {
                console.error('❌ Failed to approve connection with SIWE:', err);
                setError(err instanceof Error ? err.message : 'Failed to approve connection');
                setState('error');
              }
            }}
            onError={async (error, errorCode) => {
              try {
                // Forward error and code directly from modal
                await pendingRequest.onReject(
                  error.message,
                  errorCode ?? standardErrorCodes.provider.userRejectedRequest
                );
                communicator.requestClose();
              } catch (err) {
                console.error('❌ Failed to reject:', err);
                communicator.requestClose();
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
              debugLog('✅ User approved connection');

              // Build response per ERC-7846 format (no capabilities)
              const response = {
                accounts: [
                  {
                    address: walletAddress,
                  },
                ],
              };

              await pendingRequest.onApprove(response);
              setState('success');
              scheduleClose(CLOSE_DELAY_MS);
            } catch (err) {
              console.error('❌ Failed to approve connection:', err);
              setError(err instanceof Error ? err.message : 'Failed to approve connection');
              setState('error');
            }
          }}
          onError={async (error, errorCode) => {
            try {
              // Forward error and code directly from modal
              await pendingRequest.onReject(
                error.message,
                errorCode ?? standardErrorCodes.provider.userRejectedRequest
              );
              communicator.requestClose();
            } catch (err) {
              console.error('❌ Failed to reject:', err);
              communicator.requestClose();
            }
          }}
        />
      );
    }

    // No pending request yet - should not normally be seen
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2"></div>
          <p className="text-muted-foreground">Waiting for request...</p>
        </div>
      </div>
    );
  }

  return null;
}
