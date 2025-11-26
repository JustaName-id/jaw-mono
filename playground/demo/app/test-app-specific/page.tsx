'use client';

import { useState } from 'react';
import { JAWUIProvider, useJAW, useSendTransaction, useSignMessage } from '@jaw/react';
import { Mode } from '@jaw.id/core';
// Import CSS explicitly for app-specific mode styling
import '@jaw/ui/style.css';

function TestAppSpecific() {
  const { connect, disconnect, isConnected, address, chainId } = useJAW();
  const { sendTransaction, isLoading: isSending, error: sendError } = useSendTransaction();
  const { signMessage, isLoading: isSigning, error: signError } = useSignMessage();
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleConnect = async () => {
    try {
      addLog('🔗 Connecting with app-specific mode...');
      await connect();
      addLog('✅ Connected successfully!');
    } catch (error) {
      addLog(`❌ Connection error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      addLog('🔌 Disconnecting...');
      await disconnect();
      addLog('✅ Disconnected');
    } catch (error) {
      addLog(`❌ Disconnect error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSignMessage = async () => {
    try {
      addLog('✍️ Requesting signature...');
      const signature = await signMessage('Hello from app-specific mode!');
      if (signature) {
        addLog(`✅ Signature: ${signature}`);
      }
    } catch (error) {
      addLog(`❌ Sign error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSendTransaction = async () => {
    try {
      addLog('💸 Sending transaction...');
      const result = await sendTransaction([
        {
          to: '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0',
          value: '0x0',
          data: '0x',
        }
      ]);
      if (result) {
        addLog(`✅ Transaction sent! ID: ${result.id}`);
      }
    } catch (error) {
      addLog(`❌ Transaction error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-indigo-950">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
            JAW SDK - App-Specific Mode Test
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Testing direct in-app authentication without popup
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            Connection Status
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Status:</span>
              <span className={`font-semibold ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            {address && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Address:</span>
                <code className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded text-sm">
                  {address}
                </code>
              </div>
            )}
            {chainId && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">Chain:</span>
                <code className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded text-sm">
                  {chainId}
                </code>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Test Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleConnect}
              disabled={isConnected}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              Connect Wallet
            </button>

            <button
              onClick={handleDisconnect}
              disabled={!isConnected}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg font-semibold hover:from-red-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              Disconnect
            </button>

            <button
              onClick={handleSignMessage}
              disabled={!isConnected || isSigning}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {isSigning ? 'Signing...' : 'Sign Message'}
            </button>

            <button
              onClick={handleSendTransaction}
              disabled={!isConnected || isSending}
              className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
            >
              {isSending ? 'Sending...' : 'Send Transaction'}
            </button>
          </div>

          {/* Error Display */}
          {(signError || sendError) && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-700 dark:text-red-400 text-sm">
                ❌ {signError?.message || sendError?.message}
              </p>
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 mb-6 border border-blue-200 dark:border-blue-800">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            ℹ️ App-Specific Mode Features:
          </h3>
          <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>Dialogs render directly in your app (no popup)</li>
            <li>Uses React Portals for modal management</li>
            <li>Passkey authentication happens in-app</li>
            <li>Full control over UI styling and behavior</li>
          </ul>
        </div>

        {/* Logs */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Activity Logs
            </h2>
            <button
              onClick={() => setLogs([])}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
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

export default function AppSpecificTestPage() {
  return (
    <JAWUIProvider
      apiKey={process.env.NEXT_PUBLIC_API_KEY || ''}
      appName="JAW App-Specific Demo"
      appLogoUrl="https://avatars.githubusercontent.com/u/159771991?s=200&v=4"
      defaultChainId={1}
      preference={{
        mode: Mode.AppSpecific,
        showTestnets: true,
      }}
    >
      <TestAppSpecific />
    </JAWUIProvider>
  );
}