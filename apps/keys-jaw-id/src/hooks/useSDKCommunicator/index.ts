/**
 * useSDKCommunicator Hook (Refactored)
 * Handles postMessage communication with Coinbase SDK
 *
 * Key improvements:
 * - LocalStorage-based key persistence
 * - Key restoration for follow-up requests
 * - Dynamic origin handling
 * - selectSignerType event support
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  URLParams,
  PopupLoadedEvent,
  PopupUnloadEvent,
  ConfigResponse,
  RPCRequest,
  RPCResponse,
  SDKState,
  SDKRequestUI,
  SDKRequestType,
  DecryptedRequest,
  ResponsePayload,
} from '../../lib/sdk-types';
import {
  generateKeyPair,
  importPublicKey,
  exportPublicKey,
  deriveSharedSecret,
  encrypt,
  decrypt,
  testEncryption,
  saveKeysToStorage,
  restoreSharedSecret,
  getOwnPublicKeyFromStorage,
  clearStoredKeys,
} from '../../lib/sdk-crypto';

export function useSDKCommunicator() {
  const [sdkState, setSDKState] = useState<SDKState>({
    isInitialized: false,
    config: null,
    urlParams: null,
    allowedOrigin: null, // Will be set dynamically from first message
    currentRequest: null,
    senderPublicKey: '',
  });

  const [pendingRequest, setPendingRequest] = useState<SDKRequestUI | null>(null);
  const openerRef = useRef<Window | null>(null);
  const messageCountRef = useRef(0);

  // Parse URL parameters
  const parseURLParams = useCallback((): URLParams | null => {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const sdkName = params.get('sdkName');
    const sdkVersion = params.get('sdkVersion');
    const origin = params.get('origin');
    const coop = params.get('coop');

    if (!sdkName || !sdkVersion) {
      console.warn('⚠️ Missing required URL parameters');
      return null;
    }

    return {
      sdkName: decodeURIComponent(sdkName),
      sdkVersion: decodeURIComponent(sdkVersion),
      origin: origin ? decodeURIComponent(origin) : null,
      coop,
    };
  }, []);

  // Get target origin (use '*' if not set yet, for initial PopupLoaded)
  const getTargetOrigin = useCallback(() => {
    return sdkState.allowedOrigin || '*';
  }, [sdkState.allowedOrigin]);

  // Send PopupLoaded event
  const sendPopupLoaded = useCallback(() => {
    if (!openerRef.current) return;

    const message: PopupLoadedEvent = {
      event: 'PopupLoaded',
      id: crypto.randomUUID(),
    };

    const targetOrigin = getTargetOrigin();
    console.log('📤 Sending PopupLoaded:', { message, targetOrigin });
    openerRef.current.postMessage(message, targetOrigin);
  }, [getTargetOrigin]);

  // Send PopupUnload event and close window
  const sendPopupUnloadAndClose = useCallback(() => {
    if (!openerRef.current) return;

    const message: PopupUnloadEvent = {
      event: 'PopupUnload',
      id: crypto.randomUUID(),
    };

    console.log('📤 Sending PopupUnload:', message);
    openerRef.current.postMessage(message, getTargetOrigin());

    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 100);
  }, [getTargetOrigin]);

  // Send encrypted RPC response (with key restoration from localStorage)
  const sendRPCResponse = useCallback(async (
    request: RPCRequest,
    result: unknown,
    isError = false,
    includeData = false
  ) => {
    console.log('🚀 sendRPCResponse called with:', {
      requestId: request.id,
      isError,
      includeData,
      resultType: typeof result,
      result
    });

    if (!openerRef.current) {
      console.error('❌ Cannot send response: no opener');
      return;
    }

    try {
      // Restore shared secret from localStorage using sender's public key
      const sharedSecret = await restoreSharedSecret(request.sender);

      if (!sharedSecret) {
        throw new Error('Cannot encrypt response: keys not found in storage');
      }

      // Prepare response payload
      const payload: ResponsePayload = {
        result: isError
          ? { error: result as any }
          : { value: result }
      };

      console.log('📦 Prepared payload:', JSON.stringify(payload, null, 2));

      // Add data object for handshake responses (includes chains, capabilities, nativeCurrencies)
      if (includeData) {
        payload.data = {
          chains: {
            "1": "https://eth-mainnet.g.alchemy.com/v2/placeholder",
            "84532": "https://base-sepolia.g.alchemy.com/v2/placeholder",
            "8452": "https://base-mainnet.g.alchemy.com/v2/placeholder"
          },
          capabilities: {
            "0x14a34": { // 84532 in hex (Base Sepolia)
              "paymasterService": { "supported": true },
              "atomicBatch": { "supported": true }
            },
            "0x2105": { // 8453 in hex (Base Mainnet)
              "paymasterService": { "supported": true },
              "atomicBatch": { "supported": true }
            }
          },
          nativeCurrencies: {
            "1": { "name": "Ether", "symbol": "ETH", "decimals": 18 },
            "84532": { "name": "Ether", "symbol": "ETH", "decimals": 18 },
            "8452": { "name": "Ether", "symbol": "ETH", "decimals": 18 }
          }
        };
      }

      console.log('🔒 Encrypting payload...');

      // Encrypt the payload
      const encrypted = await encrypt(payload, sharedSecret);

      // Get own public key from storage
      const ownPublicKeyHex = await getOwnPublicKeyFromStorage();
      if (!ownPublicKeyHex) {
        throw new Error('Own public key not found in storage');
      }

      const response: RPCResponse = {
        requestId: request.id,
        id: crypto.randomUUID(),
        sender: ownPublicKeyHex,
        correlationId: request.correlationId,
        content: { encrypted },
        timestamp: new Date(),
      };

      console.log('📤 Sending encrypted RPC Response:', {
        requestId: response.requestId,
        id: response.id,
        correlationId: response.correlationId,
        ivLength: encrypted.iv.length,
        cipherTextLength: encrypted.cipherText.byteLength,
      });

      openerRef.current.postMessage(response, getTargetOrigin());
      console.log('✅ Response sent successfully');
    } catch (error) {
      console.error('❌ Failed to send encrypted response:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));

      // Try to send a basic error response
      try {
        console.log('🔄 Attempting to send error response...');
        const sharedSecret = await restoreSharedSecret(request.sender);
        if (sharedSecret) {
          const errorPayload: ResponsePayload = {
            result: {
              error: {
                code: -32603,
                message: error instanceof Error ? error.message : 'Internal error'
              }
            }
          };
          const encrypted = await encrypt(errorPayload, sharedSecret);
          const ownPublicKeyHex = await getOwnPublicKeyFromStorage();

          if (ownPublicKeyHex) {
            const errorResponse: RPCResponse = {
              requestId: request.id,
              id: crypto.randomUUID(),
              sender: ownPublicKeyHex,
              correlationId: request.correlationId,
              content: { encrypted },
              timestamp: new Date(),
            };

            openerRef.current!.postMessage(errorResponse, getTargetOrigin());
            console.log('✅ Error response sent');
          }
        }
      } catch (innerError) {
        console.error('❌ Failed to send error response:', innerError);
      }
    }
  }, [getTargetOrigin]);

  // Handle handshake request (CLEAR old keys, derive new ones, SAVE to localStorage)
  const handleHandshake = useCallback(async (request: RPCRequest) => {
    console.log('🤝 HANDSHAKE REQUEST DETECTED');
    console.log('   Method:', request.content.handshake!.method);
    console.log('   Params:', request.content.handshake!.params);
    console.log('   Sender (SDK Public Key):', request.sender);

    try {
      // CRITICAL: Clear old keys before starting new handshake
      console.log('🗑️ Clearing old keys for new connection...');
      await clearStoredKeys();

      // Import peer's public key
      const peerKey = await importPublicKey(request.sender);
      console.log('✅ Successfully imported peer public key');

      // Generate our key pair
      const ownKeyPair = await generateKeyPair();
      console.log('✅ Generated own ECDH key pair');

      // Derive shared secret
      const sharedSecret = await deriveSharedSecret(
        ownKeyPair.privateKey,
        peerKey
      );
      console.log('✅ Derived shared AES-GCM secret');

      // CRITICAL: Save keys to localStorage for future encrypted requests
      await saveKeysToStorage(ownKeyPair, request.sender);

      // Test encryption round-trip
      const testPassed = await testEncryption({ test: 'hello' }, sharedSecret);
      console.log('🔒 Encryption test:', testPassed ? '✅ PASSED' : '❌ FAILED');

      // Get our public key for response
      const ownPublicKeyHex = await exportPublicKey(ownKeyPair.publicKey);
      console.log('🔑 Own Public Key:', ownPublicKeyHex);

      setSDKState(prev => ({ ...prev, currentRequest: request }));

      const method = request.content.handshake!.method;
      const params = request.content.handshake!.params;

      console.log(`🔧 Routing handshake method: ${method}`);

      // Route based on method
      switch (method) {
        case 'handshake': {
          // Pure handshake (SDK expects minimal response)
          console.log('⚠️ Received generic "handshake" method');
          console.log('   Responding with minimal success...');
          await sendRPCResponse(request, true, false, false);
          console.log('✅ Handshake response sent');
          break;
        }

        case 'wallet_connect':
        case 'eth_requestAccounts': {
          console.log(`🔗 ${method} - requesting connection with capabilities`);
          setPendingRequest({
            type: SDKRequestType.CONNECT,
            request,
            metadata: sdkState.config?.metadata || null,
            method,
            params: params,
            onApprove: async (accounts) => {
              console.log('✅ User approved connection with accounts:', accounts);
              const accountsArray = Array.isArray(accounts) ? accounts : [accounts];
              await sendRPCResponse(request, accountsArray, false, true); // includeData=true
            },
            onReject: async (error) => {
              console.log('❌ User rejected connection:', error);
              await sendRPCResponse(request, { code: -32000, message: error }, true);
            },
          });
          break;
        }

        default:
          console.warn(`⚠️ Unsupported handshake method: ${method}`);
          await sendRPCResponse(request, { code: -32601, message: `Method ${method} not supported` }, true);
      }
    } catch (error) {
      console.error('❌ Handshake error:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }
  }, [sdkState.config, sendRPCResponse]);

  // Handle encrypted request (RESTORE keys from localStorage, decrypt, route)
  const handleEncryptedRequest = useCallback(async (request: RPCRequest) => {
    console.log('🔐 ENCRYPTED REQUEST DETECTED');
    console.log('   IV length:', request.content.encrypted!.iv.length);
    console.log('   CipherText length:', request.content.encrypted!.cipherText.byteLength);
    console.log('   Sender:', request.sender.slice(0, 20) + '...');

    try {
      // CRITICAL: Restore shared secret from localStorage
      console.log('🔄 Restoring shared secret from localStorage...');
      const sharedSecret = await restoreSharedSecret(request.sender);

      if (!sharedSecret) {
        throw new Error('Cannot decrypt: shared secret not found in storage (handshake may have expired)');
      }

      console.log('✅ Shared secret restored successfully');

      // Decrypt the request
      const decrypted: DecryptedRequest = await decrypt(
        request.content.encrypted!,
        sharedSecret
      );

      console.log('🔓 DECRYPTED REQUEST:');
      console.log('   Action Method:', decrypted.action.method);
      console.log('   Action Params:', decrypted.action.params);
      console.log('   Chain ID:', decrypted.chainId);

      setSDKState(prev => ({ ...prev, currentRequest: request }));

      const { method, params } = decrypted.action;
      const { chainId } = decrypted;

      console.log(`🔧 Routing encrypted method: ${method} on chain ${chainId}`);

      // Route based on method
      switch (method) {
        case 'personal_sign': {
          console.log('📝 Personal Sign Request');
          setPendingRequest({
            type: SDKRequestType.SIGN_MESSAGE,
            request,
            metadata: sdkState.config?.metadata || null,
            method,
            params,
            chainId,
            onApprove: async (signature) => {
              console.log('✅ User approved signature:', signature);
              await sendRPCResponse(request, signature);
            },
            onReject: async (error) => {
              console.log('❌ User rejected signature:', error);
              await sendRPCResponse(request, { code: -32000, message: error }, true);
            },
          });
          break;
        }

        case 'eth_sendTransaction':
        case 'wallet_sendCalls': {
          console.log('💸 Transaction Request');
          setPendingRequest({
            type: SDKRequestType.SEND_TRANSACTION,
            request,
            metadata: sdkState.config?.metadata || null,
            method,
            params,
            chainId,
            onApprove: async (txHash) => {
              console.log('✅ User approved transaction:', txHash);
              await sendRPCResponse(request, txHash);
            },
            onReject: async (error) => {
              console.log('❌ User rejected transaction:', error);
              await sendRPCResponse(request, { code: -32000, message: error }, true);
            },
          });
          break;
        }

        case 'eth_chainId': {
          console.log('⛓️  Chain ID Request');
          const currentChainId = `0x${chainId.toString(16)}`;
          await sendRPCResponse(request, currentChainId);
          break;
        }

        default:
          console.warn(`⚠️ Unsupported encrypted method: ${method}`);
          await sendRPCResponse(request, { code: -32601, message: `Method ${method} not supported` }, true);
      }
    } catch (error) {
      console.error('❌ Decryption/handling error:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
    }
  }, [sdkState.config, sendRPCResponse]);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    // Ignore messages from same origin (React DevTools, etc.)
    if (event.origin === window.location.origin) {
      return;
    }

    // Set allowed origin from first valid message (dynamic origin detection)
    if (!sdkState.allowedOrigin && event.origin && event.source === openerRef.current) {
      console.log('🔒 Locking origin to:', event.origin);
      setSDKState(prev => ({ ...prev, allowedOrigin: event.origin }));
    }

    // Validate origin if set
    if (sdkState.allowedOrigin && event.origin !== sdkState.allowedOrigin) {
      console.warn('❌ Message from invalid origin:', event.origin);
      return;
    }

    // Validate source is opener
    if (event.source !== openerRef.current) {
      console.warn('⚠️ Message not from opener, ignoring');
      return;
    }

    // Debug logging
    messageCountRef.current++;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📨 MESSAGE #${messageCountRef.current} FROM SDK`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log('🔍 RAW MESSAGE DATA:', event.data);

    const data = event.data;

    // Handle selectSignerType event (SDK asks what type of wallet we are)
    if (data.event === 'selectSignerType' && data.id) {
      console.log('📍 selectSignerType request - responding with "scw" (Smart Contract Wallet)');
      openerRef.current!.postMessage({
        requestId: data.id,
        data: 'scw'
      }, getTargetOrigin());
      return;
    }

    // Handle config response (to PopupLoaded)
    if (data.requestId && data.data?.version) {
      const configResponse = data as ConfigResponse;
      setSDKState(prev => ({
        ...prev,
        config: configResponse.data,
        isInitialized: true,
      }));
      console.log('✅ SDK initialized with config:', configResponse.data);
      return;
    }

    // Handle RPC handshake request
    if (data.id && data.content?.handshake) {
      handleHandshake(data as RPCRequest);
      return;
    }

    // Handle RPC encrypted request
    if (data.id && data.content?.encrypted) {
      handleEncryptedRequest(data as RPCRequest);
      return;
    }

    console.log('⚠️ Unknown message type:', data);
  }, [sdkState.allowedOrigin, sdkState.config, handleHandshake, handleEncryptedRequest, getTargetOrigin]);

  // Initialize on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Parse URL params
    const params = parseURLParams();
    if (!params) {
      console.error('❌ Failed to parse URL parameters');
      return;
    }

    // Store opener reference
    openerRef.current = window.opener;
    if (!openerRef.current) {
      console.warn('⚠️ No window.opener found - not opened as popup');
      return;
    }

    // Set URL params (origin may be set dynamically from first message)
    setSDKState(prev => ({
      ...prev,
      urlParams: params,
      allowedOrigin: params.origin, // May be null, will be set dynamically
    }));

    console.log('🚀 SDK Communicator initialized', params);
  }, [parseURLParams]);

  // Send PopupLoaded after opener is available
  useEffect(() => {
    if (openerRef.current) {
      sendPopupLoaded();
    }
  }, [sendPopupLoaded]);

  // Setup message listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // Cleanup: Keys persist in localStorage for follow-up requests
  useEffect(() => {
    const handleBeforeUnload = () => {
      sendPopupUnloadAndClose();
      // Keys remain in localStorage for encrypted follow-up requests
      // They will only be cleared when a new handshake starts
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sendPopupUnloadAndClose]);

  // Update sender public key when wallet is available
  const setSenderPublicKey = useCallback((publicKey: string) => {
    setSDKState(prev => ({ ...prev, senderPublicKey: publicKey }));
  }, []);

  return {
    sdkState,
    pendingRequest,
    setPendingRequest,
    setSenderPublicKey,
    sendPopupUnloadAndClose,
    isSDKMode: !!sdkState.urlParams,
  };
}
