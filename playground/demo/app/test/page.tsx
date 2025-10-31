'use client';

import { useState } from 'react';
import { createJAWSDK } from '@jaw.id/core';

export default function TestPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [chainId, setChainId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [sdk] = useState(() =>
    createJAWSDK({
      appName: 'JAW Demo App',
      appLogoUrl: null,
      appChainIds: [1, 137, 8453], // Ethereum, Polygon, Base
      preference: {
        keysUrl: 'http://localhost:3001', // Local popup URL
      },
      apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
    })
  );

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleConnect = async () => {
    try {
      addLog('Connecting to JAW Provider...');
      const provider = sdk.getProvider();

      const accountsResult = await provider.request({
        method: 'eth_requestAccounts',
        params: []
      });

      console.log('[Demo] accountsResult type:', typeof accountsResult, 'isArray:', Array.isArray(accountsResult));
      console.log('[Demo] accountsResult:', accountsResult);

      // Handle both array format and object format
      let accounts: string[];
      if (Array.isArray(accountsResult)) {
        accounts = accountsResult as string[];
      } else if (accountsResult && typeof accountsResult === 'object' && 'accounts' in accountsResult) {
        // Handle WalletConnectResponse format
        const walletConnectResponse = accountsResult as { accounts: { address: string }[] };
        accounts = walletConnectResponse.accounts.map(acc => acc.address);
      } else {
        throw new Error('Unexpected accounts format: ' + JSON.stringify(accountsResult));
      }

      setAccounts(accounts);
      setIsConnected(true);
      console.log('[Demo] Connection successful, accounts stored:', accounts);
      addLog(`Connected! Accounts: ${accounts.join(', ')}`);

      // Get chain ID
      const chainIdResult = await provider.request({
        method: 'eth_chainId',
        params: []
      });
      setChainId(chainIdResult as string);
      addLog(`Chain ID: ${chainIdResult}`);
    } catch (error) {
      console.error('[Demo] Connection error:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, null, 2)
        : String(error);
      addLog(`Error connecting: ${errorMessage}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      addLog('Disconnecting...');
      await sdk.disconnect();
      setIsConnected(false);
      setAccounts([]);
      setChainId(null);
      addLog('Disconnected successfully');
    } catch (error) {
      addLog(`Error disconnecting: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleGetBalance = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      addLog(`Requesting balance for ${accounts[0]}...`);
      const provider = sdk.getProvider();
      const balance = await provider.request({
        method: 'eth_getBalance',
        params: [accounts[0], 'latest']
      });
      addLog(`Balance for ${accounts[0]}: ${balance}`);
    } catch (error) {
      console.error('Balance error details:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'object' && error !== null && 'message' in error
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ? (error as { message: string }).message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, null, 2)
        : String(error);
      addLog(`Error getting balance: ${errorMessage}`);
    }
  };

  const handleSignMessage = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const message = 'Hello from JAW SDK Test!';
      const provider = sdk.getProvider();
      addLog(`Requesting signature for message: "${message}"...`);
      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, accounts[0]]
      });
      addLog(`Signature: ${signature}`);
    } catch (error) {
      console.error('Sign message error details:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, null, 2)
        : String(error);
      addLog(`Error signing message: ${errorMessage}`);
    }
  };

  const handleSignTypedData = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' }
          ],
          Person: [
            { name: 'name', type: 'string' },
            { name: 'wallet', type: 'address' }
          ],
          Mail: [
            { name: 'from', type: 'Person' },
            { name: 'to', type: 'Person' },
            { name: 'contents', type: 'string' }
          ]
        },
        primaryType: 'Mail',
        domain: {
          name: 'Ether Mail',
          version: '1',
          chainId: 1,
          verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
        },
        message: {
          from: {
            name: 'Cow',
            wallet: accounts[0]
          },
          to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
          },
          contents: 'Hello, Bob!'
        }
      };

      const provider = sdk.getProvider();
      addLog('Requesting typed data signature...');
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [accounts[0], JSON.stringify(typedData)]
      });
      addLog(`Typed data signature: ${signature}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error signing typed data: ${errorMessage}`);
    }
  };

  const handleSendTransaction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.getProvider();
      addLog('Requesting transaction signature...');
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
          value: '0x0', // 0 ETH
          gas: '0x5208', // 21000 gas
          gasPrice: '0x3b9aca00' // 1 gwei
        }]
      });
      addLog(`Transaction hash: ${txHash}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error sending transaction: ${errorMessage}`);
    }
  };

  const handleSignTransaction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.getProvider();
      addLog('Requesting transaction signature...');
      const signedTx = await provider.request({
        method: 'eth_signTransaction',
        params: [{
          from: accounts[0],
          to: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
          value: '0x0',
          gas: '0x5208',
          gasPrice: '0x3b9aca00'
        }]
      });
      addLog(`Signed transaction: ${signedTx}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error signing transaction: ${errorMessage}`);
    }
  };

  const handleGetCapabilities = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.getProvider();
      addLog(`Requesting wallet capabilities for account: ${accounts[0]}...`);
      console.log('[Demo] Calling wallet_getCapabilities with params:', [accounts[0]]);

      const capabilities = await provider.request({
        method: 'wallet_getCapabilities',
        params: [accounts[0]]
      });

      console.log('[Demo] Capabilities received:', capabilities);
      addLog(`Capabilities: ${JSON.stringify(capabilities, null, 2)}`);
    } catch (error) {
      console.error('[Demo] Get capabilities error details:', error);
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : typeof error === 'object' && error !== null
        ? JSON.stringify(error, null, 2)
        : String(error);
      addLog(`Error getting capabilities: ${errorMessage}`);
    }
  };

  const handleWatchAsset = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting to watch USDC token...');
      const result = await provider.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: '0xA0b86a33E6441b8c4C8C0e4b8b8c4C8C0e4b8b8c4',
            symbol: 'USDC',
            decimals: 6,
            image: 'https://example.com/usdc.png'
          }
        }
      });
      addLog(`Watch asset result: ${result}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error watching asset: ${errorMessage}`);
    }
  };

  const handleAddEthereumChain = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting to add Polygon chain...');
      const result = await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x89',
          chainName: 'Polygon',
          nativeCurrency: {
            name: 'MATIC',
            symbol: 'MATIC',
            decimals: 18
          },
          rpcUrls: ['https://polygon-rpc.com'],
          blockExplorerUrls: ['https://polygonscan.com']
        }]
      });
      addLog(`Add chain result: ${result}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error adding chain: ${errorMessage}`);
    }
  };

  const handleGetCoinbase = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting coinbase address...');
      const coinbase = await provider.request({
        method: 'eth_coinbase',
        params: []
      });
      addLog(`Coinbase: ${coinbase}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error getting coinbase: ${errorMessage}`);
    }
  };

  const handleGetAccounts = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting accounts...');
      const accountsResult = await provider.request({
        method: 'eth_accounts',
        params: []
      });
      addLog(`Accounts: ${JSON.stringify(accountsResult)}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error getting accounts: ${errorMessage}`);
    }
  };

  const handleGetChainId = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting chain ID...');
      const chainId = await provider.request({
        method: 'eth_chainId',
        params: []
      });
      addLog(`Chain ID: ${chainId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error getting chain ID: ${errorMessage}`);
    }
  };

  const handleGetNetVersion = async () => {
    try {
      const provider = sdk.getProvider();
      addLog('Requesting net version...');
      const netVersion = await provider.request({
        method: 'net_version',
        params: []
      });
      addLog(`Net version: ${netVersion}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error getting net version: ${errorMessage}`);
    }
  };

  const handleSwitchChain = async (targetChainId: string) => {
    try {
      const provider = sdk.getProvider();
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainId }]
      });
      setChainId(targetChainId);
      addLog(`Switched to chain: ${targetChainId}`);
    } catch (error) {
      addLog(`Error switching chain: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          JAW SDK Test Page
        </h1>

        {/* Connection Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Connection Status
          </h2>
          <div className="space-y-2">
            <p className="text-gray-700 dark:text-gray-300">
              <span className="font-medium">Status:</span>{' '}
              <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </p>
            {accounts.length > 0 && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Accounts:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                  {accounts.join(', ')}
                </code>
              </p>
            )}
            {chainId && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Chain ID:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                  {chainId}
                </code>
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Connection Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleConnect}
              disabled={isConnected}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Connect
            </button>
            <button
              onClick={handleDisconnect}
              disabled={!isConnected}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Account & Chain Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Account & Chain Info
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={handleGetAccounts}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Accounts
            </button>
            <button
              onClick={handleGetCoinbase}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Coinbase
            </button>
            <button
              onClick={handleGetChainId}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Chain ID
            </button>
            <button
              onClick={handleGetNetVersion}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Net Version
            </button>
            <button
              onClick={handleGetBalance}
              disabled={!isConnected}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Balance
            </button>
            <button
              onClick={handleGetCapabilities}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Get Capabilities
            </button>
          </div>
        </div>

        {/* Signing Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Signing Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={handleSignMessage}
              disabled={!isConnected}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Sign Message
            </button>
            <button
              onClick={handleSignTypedData}
              disabled={!isConnected}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Sign Typed Data
            </button>
            <button
              onClick={handleSignTransaction}
              disabled={!isConnected}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Sign Transaction
            </button>
            <button
              onClick={handleSendTransaction}
              disabled={!isConnected}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Send Transaction
            </button>
          </div>
        </div>

        {/* Wallet Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Wallet Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleWatchAsset}
              disabled={!isConnected}
              className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Watch Asset (USDC)
            </button>
            <button
              onClick={handleAddEthereumChain}
              disabled={!isConnected}
              className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Add Ethereum Chain
            </button>
          </div>
        </div>

        {/* Chain Switching */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Switch Chain
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => handleSwitchChain('0x1')}
              disabled={!isConnected}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Ethereum (0x1)
            </button>
            <button
              onClick={() => handleSwitchChain('0x89')}
              disabled={!isConnected}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Polygon (0x89)
            </button>
            <button
              onClick={() => handleSwitchChain('0x2105')}
              disabled={!isConnected}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Base (0x2105)
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Activity Logs
            </h2>
            <button
              onClick={clearLogs}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Clear Logs
            </button>
          </div>
          <div className="bg-gray-100 dark:bg-gray-900 rounded p-4 h-64 overflow-y-auto font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No activity yet...</p>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="text-gray-700 dark:text-gray-300 mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
