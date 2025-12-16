'use client';

import { WagmiProviders } from './providers';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
  useBalance,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
} from 'wagmi';
import { useState } from 'react';
import { formatUnits, parseEther } from 'viem';
import { config } from './config';

function WalletStatus() {
  const { address, isConnected, connector } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const { sendTransaction, isPending: isSending, data: txHash } = useSendTransaction();
  const { signMessage, isPending: isSigningMessage, data: signature } = useSignMessage();
  const { signTypedData, isPending: isSigningTypedData, data: typedSignature } = useSignTypedData();
  const [logs, setLogs] = useState<string[]>([]);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('Hello from JAW Wallet!');

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleConnect = async () => {
    const jawConnector = connectors.find((c) => c.id === 'jawWallet');
    if (jawConnector) {
      addLog('Connecting via wagmi...');
      try {
        connect({ connector: jawConnector });
        addLog('Connection initiated');
      } catch (err) {
        addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      addLog('JAW Wallet connector not found');
    }
  };

  const handleDisconnect = () => {
    addLog('Disconnecting...');
    disconnect();
    addLog('Disconnected');
  };

  const handleSwitchChain = (newChainId: typeof config.chains[number]['id']) => {
    addLog(`Switching to chain ${newChainId}...`);
    switchChain({ chainId: newChainId });
  };

  const clearLogs = () => setLogs([]);

  const handleSendTransaction = () => {
    if (!toAddress || !amount) {
      addLog('Please enter recipient address and amount');
      return;
    }
    addLog(`Sending ${amount} ETH to ${toAddress}...`);
    sendTransaction({
      to: toAddress as `0x${string}`,
      value: parseEther(amount),
    });
  };

  const handleSignMessage = () => {
    if (!message) {
      addLog('Please enter a message to sign');
      return;
    }
    addLog(`Signing message: "${message}"...`);
    signMessage({ message });
  };

  const handleSignTypedData = () => {
    addLog('Signing typed data (EIP-712)...');
    signTypedData({
      domain: {
        name: 'JAW Wallet Demo',
        version: '1',
        chainId: chainId,
      },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' },
        ],
        Mail: [
          { name: 'from', type: 'Person' },
          { name: 'to', type: 'Person' },
          { name: 'contents', type: 'string' },
        ],
      },
      primaryType: 'Mail',
      message: {
        from: {
          name: 'Alice',
          wallet: address || '0x0000000000000000000000000000000000000000',
        },
        to: {
          name: 'Bob',
          wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
        },
        contents: 'Hello, Bob!',
      },
    });
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          JAW Wagmi Connector Test
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
            {address && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Address:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                  {address}
                </code>
              </p>
            )}
            {connector && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Connector:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                  {connector.name}
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
            {balance && (
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">Balance:</span>{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">
                  {formatUnits(balance.value, balance.decimals)} {balance.symbol}
                </code>
              </p>
            )}
            {error && (
              <p className="text-red-600">
                <span className="font-medium">Error:</span> {error.message}
              </p>
            )}
          </div>
        </div>

        {/* Connection Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Connection Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleConnect}
              disabled={isConnected || isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? 'Connecting...' : 'Connect'}
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

        {/* Chain Switching */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Switch Chain
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {chains.map((chain) => (
              <button
                key={chain.id}
                onClick={() => handleSwitchChain(chain.id)}
                disabled={!isConnected || chainId === chain.id}
                className={`px-4 py-2 text-white rounded transition-colors disabled:cursor-not-allowed ${
                  chainId === chain.id
                    ? 'bg-green-600'
                    : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400'
                }`}
              >
                {chain.name} {chainId === chain.id && ''}
              </button>
            ))}
          </div>
        </div>

        {/* Send Transaction */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Send Transaction
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Recipient Address
              </label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount (ETH)
              </label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleSendTransaction}
              disabled={!isConnected || isSending}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSending ? 'Sending...' : 'Send Transaction'}
            </button>
            {txHash && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tx Hash:{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs break-all">
                  {txHash}
                </code>
              </p>
            )}
          </div>
        </div>

        {/* Sign Message */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Sign Message (personal_sign)
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Message
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter message to sign..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleSignMessage}
              disabled={!isConnected || isSigningMessage}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSigningMessage ? 'Signing...' : 'Sign Message'}
            </button>
            {signature && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Signature:{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs break-all">
                  {signature}
                </code>
              </p>
            )}
          </div>
        </div>

        {/* Sign Typed Data */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Sign Typed Data (EIP-712)
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Signs a sample Mail typed data structure with your wallet.
            </p>
            <button
              onClick={handleSignTypedData}
              disabled={!isConnected || isSigningTypedData}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSigningTypedData ? 'Signing...' : 'Sign Typed Data'}
            </button>
            {typedSignature && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Signature:{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs break-all">
                  {typedSignature}
                </code>
              </p>
            )}
          </div>
        </div>

        {/* Available Connectors */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Available Connectors
          </h2>
          <div className="space-y-2">
            {connectors.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ID: {c.id}</p>
                </div>
                <button
                  onClick={() => {
                    addLog(`Connecting with ${c.name}...`);
                    connect({ connector: c });
                  }}
                  disabled={isConnected}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Connect
                </button>
              </div>
            ))}
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

export default function WagmiPage() {
  return (
    <WagmiProviders>
      <WalletStatus />
    </WagmiProviders>
  );
}
