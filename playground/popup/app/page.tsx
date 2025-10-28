'use client';

import { useEffect, useState, useCallback } from 'react';
import { PopupCommunicator } from '../lib/popup-communicator';
import { CryptoHandler, type RPCRequestMessage } from '../lib/crypto-handler';
import { PasskeyService } from '../lib/passkey-service';
import type { Message, PasskeyAccount } from '@jaw.id/core';

type PopupState =
  | 'initializing'
  | 'connecting'
  | 'passkey-check'
  | 'passkey-create'
  | 'passkey-auth'
  | 'account-selection'
  | 'request-approval'
  | 'processing'
  | 'success'
  | 'error';

interface AppMetadata {
  appName: string;
  appLogoUrl: string | null;
  appChainIds: number[];
}

interface PopupConfig {
  version: string;
  metadata: AppMetadata;
  preference: {
    appSpecific: boolean;
    serverUrl: string;
  };
  location: string;
}

interface PendingRequest {
  id: string;
  method: string;
  params?: unknown[];
}

export default function PopupPage() {
  const [state, setState] = useState<PopupState>('initializing');
  const [communicator] = useState(() => new PopupCommunicator());
  const [cryptoHandler] = useState(() => new CryptoHandler());
  const [passkeyService] = useState(() => new PasskeyService({ localOnly: true }));
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [currentAccount, setCurrentAccount] = useState<PasskeyAccount | null>(null);
  const [existingAccounts, setExistingAccounts] = useState<PasskeyAccount[]>([]);

  const checkForPasskeys = useCallback(() => {
    const authCheck = passkeyService.checkAuth();
    const accounts = passkeyService.getAccounts();
    setExistingAccounts(accounts);

    if (authCheck.isAuthenticated && authCheck.address) {
      // User is already logged in
      const account = passkeyService.getCurrentAccount();
      setCurrentAccount(account || null);
      setState('account-selection');
    } else if (accounts.length > 0) {
      // Has accounts but not logged in - show auth
      setState('passkey-auth');
    } else {
      // No accounts - need to create
      setState('passkey-create');
    }
  }, [passkeyService]);

  useEffect(() => {
    const initialize = async () => {
      // Check if we have a valid opener
      if (!communicator.hasOpener()) {
        setState('error');
        setError('No valid opener window found');
        return;
      }

      // Notify opener that popup is loaded
      communicator.sendPopupLoaded();
      setState('connecting');
    };

    initialize().catch((err) => {
      console.error('Failed to initialize popup:', err);
      setState('error');
      setError('Failed to initialize popup');
    });

    // Listen for messages from the opener
    const cleanup = communicator.onMessage<PopupConfig>((message: Message) => {
      console.log('Received message from opener:', message);

      // Handle initial configuration (sent with requestId after PopupLoaded)
      if (message.requestId && message.data && typeof message.data === 'object') {
        const data = message.data as Record<string, unknown>;
        if ('version' in data && 'metadata' in data) {
          console.log('Setting config:', data);
          setConfig(data as unknown as PopupConfig);
          // After config, check for existing passkeys
          setState('passkey-check');
          checkForPasskeys();
          return;
        }
      }

      // Handle selectSignerType request
      if (message.id && 'event' in (message as Record<string, unknown>)) {
        const eventMessage = message as { id: string; event: string; data?: unknown };
        if (eventMessage.event === 'selectSignerType') {
          console.log('Received selectSignerType request, responding with scw');
          // Respond with the signer type
          communicator.sendResponse(eventMessage.id as `${string}-${string}-${string}-${string}-${string}`, 'scw');
          return;
        }
      }

      // Handle handshake RPC request (for initial connection)
      if (message.id && 'content' in (message as Record<string, unknown>) && 'sender' in (message as Record<string, unknown>)) {
        const rpcMessage = message as RPCRequestMessage;
        const content = rpcMessage.content as Record<string, unknown>;

        if ('handshake' in content) {
          const handshake = content.handshake as { method: string; params?: unknown[] };
          console.log('Received handshake request (new connection):', handshake);

          // Clear old keys before establishing new connection
          cryptoHandler.clear()
            .then(() => {
              console.log('Cleared old encryption keys for new connection');
              // Process the handshake to extract and store peer's public key
              return cryptoHandler.processHandshakeRequest(rpcMessage);
            })
            .then(() => {
              console.log('Handshake processed successfully');
              // Store this as a pending request that needs user approval
              setPendingRequest({
                id: rpcMessage.id,
                method: handshake.method,
                params: handshake.params,
              });
            })
            .catch((err) => {
              console.error('Failed to process handshake:', err);
              setError('Failed to process handshake');
              setState('error');
            });

          return;
        }

        // Handle encrypted signing requests (personal_sign, etc.)
        if ('encrypted' in content) {
          console.log('Received encrypted signing request from:', rpcMessage.sender.slice(0, 20) + '...');
          
          // First, restore the shared secret using the sender's public key
          cryptoHandler.restoreSharedSecretFromMessage(rpcMessage)
            .then(() => {
              console.log('Restored shared secret for signing request');
              // Now decrypt the request
              return cryptoHandler.decryptRequest(rpcMessage);
            })
            .then((decrypted: unknown) => {
              console.log('Decrypted request:', decrypted);
              const action = (decrypted as Record<string, unknown>).action;
              
              setPendingRequest({
                id: rpcMessage.id,
                method: (action as Record<string, unknown>).method as string,
                params: (action as Record<string, unknown>).params as unknown[],
              });
              setState('request-approval');
            })
            .catch((err) => {
              console.error('Failed to decrypt request:', err);
              setError('Failed to decrypt request: ' + (err instanceof Error ? err.message : String(err)));
              setState('error');
            });

          return;
        }
      }

      // Handle RPC requests
      if (message.data && typeof message.data === 'object') {
        const data = message.data as Record<string, unknown>;
        if ('action' in data) {
          const rpcData = data as { action: { method: string; params?: unknown[] } };
          setPendingRequest({
            id: message.id || crypto.randomUUID(),
            method: rpcData.action.method,
            params: rpcData.action.params,
          });
          setState('request-approval');
        }
      }
    });

    // Notify opener when popup is closing
    const handleBeforeUnload = () => {
      communicator.sendPopupUnload();
      // Keep crypto keys in localStorage for signing requests
      // They will be cleared only when a new connection handshake starts
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cleanup();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [communicator, cryptoHandler, passkeyService, checkForPasskeys]);

  const handleCreatePasskey = useCallback(async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setState('processing');

    try {
      console.log('Creating passkey for username:', username);
      const result = await passkeyService.createPasskey(username.trim());

      console.log('Passkey created successfully:', result);
      setCurrentAccount(result.account);
      setState('account-selection');
    } catch (err) {
      console.error('Failed to create passkey:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to create passkey: ${errorMessage}`);
      setState('error');
    }
  }, [username, passkeyService]);

  const handleAuthenticatePasskey = useCallback(async () => {
    setState('processing');

    try {
      console.log('Authenticating with passkey...');
      const result = await passkeyService.authenticateWithPasskey();

      console.log('Authentication successful:', result);
      setCurrentAccount(result.account);
      setState('account-selection');
    } catch (err) {
      console.error('Failed to authenticate:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Authentication failed: ${errorMessage}`);
      setState('passkey-auth');
    }
  }, [passkeyService]);

  const handleConnect = useCallback(async () => {
    if (!pendingRequest || !currentAccount) {
      console.warn('No pending request or account');
      return;
    }

    setState('processing');

    try {
      console.log('Approving handshake request with passkey account:', pendingRequest);

      // Get the address from the auth state
      const authState = passkeyService.checkAuth();
      if (!authState.isAuthenticated || !authState.address) {
        throw new Error('Not authenticated or address not found');
      }

      const address = authState.address;

      // Create encrypted response with account
      const response = await cryptoHandler.createHandshakeResponse(
        pendingRequest.id,
        [address]
      );

      console.log('Sending encrypted handshake response');

      // Send the response back to the opener
      window.opener?.postMessage(response, '*');

      setState('success');

      // Close popup after success
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (error) {
      console.error('Error during handshake:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Handshake failed: ${errorMessage}`);
      setState('error');
    }
  }, [cryptoHandler, currentAccount, pendingRequest, passkeyService]);

  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest) {
      console.warn('No pending request');
      return;
    }

    setState('processing');

    try {
      console.log('Approving request:', pendingRequest.method);

      // Generate appropriate response based on the method
      let result: unknown;
      
      switch (pendingRequest.method) {
        case 'personal_sign':
          // Use real smart account signing for personal_sign
          try {
            const smartAccount = await passkeyService.recreateSmartAccount();
            const message = (pendingRequest.params?.[0] as string) || 'Hello, world!';
            result = await smartAccount.signMessage({
              message: message,
            });
  
            console.log('Real signature generated:', result);
          } catch (error) {
            console.error('Failed to sign with smart account:', error);
            // Fallback to mock signature if signing fails
            result = '0x' + '0'.repeat(130);
          }
          break;
        case 'eth_signTypedData_v4':
        case 'eth_signTypedData_v3':
        case 'eth_signTypedData_v1':
        case 'eth_signTypedData':
          // Use real smart account signing for typed data
          try {
            const smartAccount = await passkeyService.recreateSmartAccount();
            // Parse the typed data from the second parameter (JSON string)
            const typedDataString = pendingRequest.params?.[1];
            let typedData;
            
            if (typeof typedDataString === 'string') {
              try {
                typedData = JSON.parse(typedDataString);
              } catch (parseError) {
                console.error('Failed to parse typed data JSON:', parseError);
                throw new Error('Invalid typed data format');
              }
            } else {
              // Fallback if it's already an object
              typedData = pendingRequest.params?.[0] || {};
            }
            
            result = await smartAccount.signTypedData({
              domain: typedData.domain || {},
              types: typedData.types || {},
              primaryType: typedData.primaryType || 'EIP712Domain',
              message: typedData.message || {},
            });
            console.log('Real typed data signature generated:', result);
          } catch (error) {
            console.error('Failed to sign typed data with smart account:', error);
            // Fallback to mock signature if signing fails
            result = '0x' + '0'.repeat(130);
          }
          break;
        
        case 'eth_signTransaction':
          result = '0x' + '0'.repeat(200); // Mock signed transaction
          break;
        
        case 'eth_sendTransaction':
          result = '0x' + '0'.repeat(66); // Mock transaction hash
          break;
        
        case 'wallet_watchAsset':
          result = true; // Success
          break;
        
        case 'wallet_addEthereumChain':
          result = null; // Success
          break;
        
        case 'wallet_switchEthereumChain':
          result = null; // Success
          break;
        
        case 'wallet_getCapabilities':
          result = {
            'eth_sendTransaction': {
              supported: true
            },
            'personal_sign': {
              supported: true
            }
          };
          break;
        
        case 'eth_coinbase':
          result = passkeyService.checkAuth().address || '0x' + '0'.repeat(40);
          break;
        
        case 'eth_accounts':
          result = passkeyService.checkAuth().address ? [passkeyService.checkAuth().address] : [];
          break;
        
        case 'eth_chainId':
          result = '0x1'; // Ethereum mainnet
          break;
        
        case 'net_version':
          result = '1';
          break;
        
        case 'eth_getBalance':
          result = '0x' + (1000000000000000000).toString(16); // 1 ETH in wei
          break;
        
        default:
          result = '0x' + '0'.repeat(130); // Default mock signature
      }

      const response = await cryptoHandler.createEncryptedResponse(
        pendingRequest.id as `${string}-${string}-${string}-${string}-${string}`,
        result
      );

      console.log('Sending encrypted response');
      window.opener?.postMessage(response, '*');

      setState('success');

      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (error) {
      console.error('Error approving request:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Request failed: ${errorMessage}`);
      setState('error');
    }
  }, [cryptoHandler, pendingRequest, passkeyService]);

  const handleRejectRequest = useCallback(() => {
    console.log('Rejecting request');
    window.close();
  }, []);

  const getChainName = (chainId: number): string => {
    const chains: Record<number, string> = {
      1: 'Ethereum',
      137: 'Polygon',
      8453: 'Base',
    };
    return chains[chainId] || `Chain ${chainId}`;
  };

  const getRequestTitle = (method: string): string => {
    const titles: Record<string, string> = {
      'personal_sign': 'Signature Request',
      'eth_signTypedData_v4': 'Typed Data Signature',
      'eth_signTypedData_v3': 'Typed Data Signature',
      'eth_signTypedData_v1': 'Typed Data Signature',
      'eth_signTypedData': 'Typed Data Signature',
      'eth_signTransaction': 'Transaction Signature',
      'eth_sendTransaction': 'Send Transaction',
      'wallet_watchAsset': 'Watch Asset',
      'wallet_addEthereumChain': 'Add Network',
      'wallet_switchEthereumChain': 'Switch Network',
      'wallet_getCapabilities': 'Get Capabilities',
      'eth_coinbase': 'Get Coinbase',
      'eth_accounts': 'Get Accounts',
      'eth_chainId': 'Get Chain ID',
      'net_version': 'Get Net Version',
      'eth_getBalance': 'Get Balance',
    };
    return titles[method] || 'Request';
  };

  const getRequestDescription = (method: string): string => {
    const descriptions: Record<string, string> = {
      'personal_sign': 'a message signature',
      'eth_signTypedData_v4': 'a typed data signature',
      'eth_signTypedData_v3': 'a typed data signature',
      'eth_signTypedData_v1': 'a typed data signature',
      'eth_signTypedData': 'a typed data signature',
      'eth_signTransaction': 'a transaction signature',
      'eth_sendTransaction': 'to send a transaction',
      'wallet_watchAsset': 'to watch an asset',
      'wallet_addEthereumChain': 'to add a new network',
      'wallet_switchEthereumChain': 'to switch networks',
      'wallet_getCapabilities': 'wallet capabilities',
      'eth_coinbase': 'your coinbase address',
      'eth_accounts': 'your accounts',
      'eth_chainId': 'the chain ID',
      'net_version': 'the network version',
      'eth_getBalance': 'account balance',
    };
    return descriptions[method] || 'permission';
  };

  const getApproveButtonText = (method: string): string => {
    const buttonTexts: Record<string, string> = {
      'personal_sign': 'Sign Message',
      'eth_signTypedData_v4': 'Sign Typed Data',
      'eth_signTypedData_v3': 'Sign Typed Data',
      'eth_signTypedData_v1': 'Sign Typed Data',
      'eth_signTypedData': 'Sign Typed Data',
      'eth_signTransaction': 'Sign Transaction',
      'eth_sendTransaction': 'Send Transaction',
      'wallet_watchAsset': 'Watch Asset',
      'wallet_addEthereumChain': 'Add Network',
      'wallet_switchEthereumChain': 'Switch Network',
      'wallet_getCapabilities': 'Get Capabilities',
      'eth_coinbase': 'Get Coinbase',
      'eth_accounts': 'Get Accounts',
      'eth_chainId': 'Get Chain ID',
      'net_version': 'Get Net Version',
      'eth_getBalance': 'Get Balance',
    };
    return buttonTexts[method] || 'Approve';
  };

  const renderRequestDetails = (request: PendingRequest) => {
    if (!request.params) return null;

    switch (request.method) {
      case 'personal_sign':
        return (
          <div className="space-y-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Message:</span>
            <div className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-900 dark:text-white break-all font-mono">
                {request.params[0] as string}
              </p>
            </div>
            {request.params.length > 1 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Account:</span>
                <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                  {(request.params[1] as string).slice(0, 6)}...{(request.params[1] as string).slice(-4)}
                </span>
              </div>
            )}
          </div>
        );

      case 'eth_signTypedData_v4':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v1':
      case 'eth_signTypedData':
        return (
          <div className="space-y-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Typed Data:</span>
            <div className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-900 dark:text-white break-all font-mono">
                {typeof request.params[1] === 'string' ? request.params[1] : JSON.stringify(request.params[1], null, 2)}
              </p>
            </div>
            {request.params.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Account:</span>
                <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                  {(request.params[0] as string).slice(0, 6)}...{(request.params[0] as string).slice(-4)}
                </span>
              </div>
            )}
          </div>
        );

      case 'eth_signTransaction':
      case 'eth_sendTransaction':
        const tx = request.params[0] as Record<string, unknown>;
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">From:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {(tx.from as string)?.slice(0, 6)}...{(tx.from as string)?.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">To:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {(tx.to as string)?.slice(0, 6)}...{(tx.to as string)?.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Value:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {tx.value ? `${parseInt(tx.value as string, 16) / 1e18} ETH` : '0 ETH'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Gas:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {tx.gas ? parseInt(tx.gas as string, 16).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
        );

      case 'wallet_watchAsset':
        const asset = request.params[0] as Record<string, unknown>;
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Type:</span>
              <span className="font-medium text-gray-900 dark:text-white">{String(asset.type)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Symbol:</span>
              <span className="font-medium text-gray-900 dark:text-white">{String((asset.options as Record<string, unknown>)?.symbol)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Address:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {((asset.options as Record<string, unknown>)?.address as string)?.slice(0, 6)}...{((asset.options as Record<string, unknown>)?.address as string)?.slice(-4)}
              </span>
            </div>
          </div>
        );

      case 'wallet_addEthereumChain':
        const chain = request.params[0] as Record<string, unknown>;
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Chain Name:</span>
              <span className="font-medium text-gray-900 dark:text-white">{String(chain.chainName)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Chain ID:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">{String(chain.chainId)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Currency:</span>
              <span className="font-medium text-gray-900 dark:text-white">{String((chain.nativeCurrency as Record<string, unknown>)?.symbol)}</span>
            </div>
          </div>
        );

      case 'wallet_switchEthereumChain':
        const switchChain = request.params[0] as Record<string, unknown>;
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Chain ID:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">{String(switchChain.chainId)}</span>
            </div>
          </div>
        );

      case 'eth_getBalance':
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Account:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {(request.params[0] as string).slice(0, 6)}...{(request.params[0] as string).slice(-4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Block:</span>
              <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">
                {String(request.params[1] || 'latest')}
              </span>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Parameters:</span>
            <div className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-900 dark:text-white break-all font-mono">
                {JSON.stringify(request.params, null, 2)}
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">J</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">JAW Wallet</h1>
                {config && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">v{config.version}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-b-2xl shadow-xl p-6">
          {(state === 'initializing' || state === 'passkey-check') && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">
                {state === 'initializing' ? 'Initializing...' : 'Checking for passkeys...'}
              </p>
            </div>
          )}

          {state === 'connecting' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Connecting to app...</p>
            </div>
          )}

          {state === 'passkey-create' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Create Your Passkey
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create a passkey to securely access your wallet
                </p>
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Enter your username"
                  autoFocus
                />
              </div>

              <button
                onClick={handleCreatePasskey}
                disabled={!username.trim()}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Create Passkey
              </button>
            </div>
          )}

          {state === 'passkey-auth' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.040A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Welcome Back
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Use your passkey to access your wallet
                </p>
              </div>

              {existingAccounts.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Found {existingAccounts.length} account(s)</p>
                </div>
              )}

              <button
                onClick={handleAuthenticatePasskey}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
              >
                Authenticate with Passkey
              </button>

              <button
                onClick={() => setState('passkey-create')}
                className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
              >
                Create New Passkey
              </button>
            </div>
          )}

          {state === 'account-selection' && config && currentAccount && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Connect to App
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {config.metadata.appName} wants to connect to your wallet
                </p>
              </div>

              {config.metadata.appLogoUrl && (
                <div className="flex justify-center">
                  <img
                    src={config.metadata.appLogoUrl}
                    alt={config.metadata.appName}
                    className="w-16 h-16 rounded-lg"
                  />
                </div>
              )}

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">App:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{config.metadata.appName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Chains:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {config.metadata.appChainIds.map(getChainName).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Account:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{currentAccount.username}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Passkey:</span>
                  <span className="font-mono text-xs font-medium text-gray-900 dark:text-white">
                    {currentAccount.credentialId.slice(0, 8)}...
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleConnect}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
                >
                  Connect Wallet
                </button>
                <button
                  onClick={() => window.close()}
                  className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {state === 'request-approval' && pendingRequest && config && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {getRequestTitle(pendingRequest.method)}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {config.metadata.appName} is requesting {getRequestDescription(pendingRequest.method)}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Method:</span>
                  <span className="font-medium text-gray-900 dark:text-white font-mono text-xs">{pendingRequest.method}</span>
                </div>
                
                {renderRequestDetails(pendingRequest)}
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ Only approve this request if you trust {config.metadata.appName}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleApproveRequest}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-lg"
                >
                  {getApproveButtonText(pendingRequest.method)}
                </button>
                <button
                  onClick={handleRejectRequest}
                  className="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {state === 'processing' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Processing...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Success!</h3>
              <p className="text-gray-600 dark:text-gray-400">Connection established successfully</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Error</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error || 'An error occurred'}</p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setError(null);
                    checkForPasskeys();
                  }}
                  className="w-full py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.close()}
                  className="w-full py-2 px-6 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Secured with Passkeys • Powered by JAW Wallet
          </p>
        </div>
      </div>
    </div>
  );
}
