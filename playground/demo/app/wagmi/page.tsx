'use client';

import { WagmiProviders } from './providers';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useBalance,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useConnect as useWagmiConnect,
  useDisconnect as useWagmiDisconnect,
  useSendCalls,
} from 'wagmi';
import {
  useConnect,
  useDisconnect,
  useGrantPermissions,
  useRevokePermissions,
  usePermissions,
} from '@jaw/wagmi';
import { useState } from 'react';
import { formatUnits, parseEther, type Address } from 'viem';
import { AnyAaaaRecord } from 'dns';

// ERC-7528 native token address convention
const NATIVE_TOKEN: Address = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

function WalletStatus() {
  const { address, isConnected, connector } = useAccount();
  const { connect: wagmiConnect, connectors, isPending: isWagmiConnecting, error: wagmiError } = useWagmiConnect();
  const { disconnect: wagmiDisconnect } = useWagmiDisconnect();
  const chainId = useChainId();
  const { switchChain, chains } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const { sendTransaction, isPending: isSending, data: txHash } = useSendTransaction();
  const { signMessage, isPending: isSigningMessage, data: signature } = useSignMessage();
  const { signTypedData, isPending: isSigningTypedData, data: typedSignature } = useSignTypedData();

  // JAW Wagmi Hooks - these use useMutation so they return mutate/mutateAsync
  const { mutate: jawConnect, isPending: isJawConnecting, error: jawConnectError } = useConnect();
  const { mutate: jawDisconnect, isPending: isJawDisconnecting } = useDisconnect();
  const { mutate: grantPermissionsMutate, isPending: isGrantingPermissions, error: grantError } = useGrantPermissions();
  const { mutate: revokePermissionsMutate, isPending: isRevokingPermissions, error: revokeError } = useRevokePermissions();
  const { data: permissions, isLoading: isLoadingPermissions, error: permissionsError, refetch: refetchPermissions } = usePermissions();

  // Wagmi useSendCalls for executing with permissions (EIP-5792)
  const { sendCalls, isPending: isSendingCalls, data: sendCallsId, error: sendCallsError } = useSendCalls();

  const [logs, setLogs] = useState<string[]>([]);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('Hello from JAW!');
  const [spenderAddress, setSpenderAddress] = useState('');
  const [manualPermissionId, setManualPermissionId] = useState('');

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Standard Wagmi Connect
  const handleWagmiConnect = async () => {
    const jawConnector = connectors.find((c) => c.id === 'jaw');
    if (jawConnector) {
      addLog('Connecting via standard wagmi useConnect...');
      try {
        wagmiConnect({ connector: jawConnector });
        addLog('Connection initiated');
      } catch (err) {
        addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      addLog('JAW connector not found');
    }
  };

  // JAW useConnect (with capabilities support)
  const handleJawConnect = async () => {
    const jawConnector = connectors.find((c) => c.id === 'jaw');
    if (!jawConnector) {
      addLog('JAW connector not found');
      return;
    }
    addLog('Connecting via @jaw/wagmi useConnect...');
    try {
      jawConnect({
        connector: jawConnector,
      });
      addLog('JAW Connection initiated');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // JAW useConnect with capabilities
  const handleJawConnectWithCapabilities = async () => {
    const jawConnector = connectors.find((c) => c.id === 'jaw');
    if (!jawConnector) {
      addLog('JAW connector not found');
      return;
    }
    addLog('Connecting via @jaw/wagmi useConnect with capabilities...');
    try {
      jawConnect({
        connector: jawConnector,
        capabilities: {
          subnameTextRecords: [
            { key: 'description', value: 'This is a description' },
          ],
        },
      });
      addLog('JAW Connection with capabilities initiated');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleWagmiDisconnect = () => {
    addLog('Disconnecting via standard wagmi...');
    wagmiDisconnect();
    addLog('Disconnected');
  };

  const handleJawDisconnect = () => {
    addLog('Disconnecting via @jaw/wagmi useDisconnect...');
    jawDisconnect({connector: connector});
    addLog('JAW Disconnected');
  };

  const handleSwitchChain = (newChainId: number) => {
    addLog(`Switching to chain ${newChainId}...`);
    switchChain({ chainId: newChainId as any });
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
        name: 'JAW Demo',
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

  // Grant Permissions (ERC-7715)
  const handleGrantPermissions = () => {
    if (!spenderAddress) {
      addLog('Please enter a spender address');
      return;
    }
    addLog('Granting permissions via @jaw/wagmi useGrantPermissions...');
    try {
      grantPermissionsMutate({
        spender: spenderAddress as Address,
        expiry: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days from now
        permissions: {
          // Spend permission: allow 0.1 ETH per day
          spends: [
            {
              token: NATIVE_TOKEN,
              allowance: parseEther('0.1').toString(),
              unit: 'day',
              multiplier: 1,
            },
          ],
          // Optional: Add call permissions to restrict which contracts can be called
          calls: [
            {
              target: '0x3232323232323232323232323232323232323232',
              selector: '0x32323232',
            },
          ],
        },
      });
      addLog('Grant permissions request sent');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Revoke Permissions
  const handleRevokePermissions = () => {
    if (!permissions || permissions.length === 0) {
      addLog('No permissions to revoke');
      return;
    }
    addLog('Revoking permissions via @jaw/wagmi useRevokePermissions...');
    try {
      // Revoke the first permission by its ID (permissionId)
      const firstPermission = permissions[0];
      if (firstPermission?.permissionId) {
        revokePermissionsMutate({
          id: firstPermission.permissionId as `0x${string}`,
        });
        addLog(`Revoke permissions request sent for ID: ${firstPermission.permissionId}`);
      } else {
        addLog('No permission ID found to revoke');
      }
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Fetch Permissions
  const handleFetchPermissions = () => {
    addLog('Fetching permissions via @jaw/wagmi usePermissions...');
    refetchPermissions();
    addLog('Permissions fetch triggered');
  };

  // Execute with Permissions (EIP-5792 wallet_sendCalls)
  const handleSendCallsWithPermission = () => {
    // Use manual permission ID if provided, otherwise use first permission from list
    const permissionId = manualPermissionId || permissions?.[0]?.permissionId;

    if (!permissionId) {
      addLog('No permission ID available. Enter a permission ID or grant permissions first.');
      return;
    }
    if (!toAddress || !amount) {
      addLog('Please enter recipient address and amount');
      return;
    }

    // Ensure it starts with 0x
    const formattedId = permissionId.startsWith('0x') ? permissionId : `0x${permissionId}`;

    addLog(`Sending calls with permission ID: ${formattedId}...`);
    try {
      sendCalls({
        calls: [
          {
            to: toAddress as Address,
            value: parseEther(amount),
          },
        ],
        capabilities: {
          permissions: {
            id: formattedId as `0x${string}`,
          },
        },
      });
      addLog('Send calls with permission initiated');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
          JAW Wagmi Hooks Test
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
            {(wagmiError || jawConnectError) && (
              <p className="text-red-600">
                <span className="font-medium">Error:</span> {wagmiError?.message || jawConnectError?.message}
              </p>
            )}
          </div>
        </div>

        {/* Standard Wagmi Connection */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Standard Wagmi Connect/Disconnect
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={handleWagmiConnect}
              disabled={isConnected || isWagmiConnecting}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isWagmiConnecting ? 'Connecting...' : 'Wagmi Connect'}
            </button>
            <button
              onClick={handleWagmiDisconnect}
              disabled={!isConnected}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Wagmi Disconnect
            </button>
          </div>
        </div>

        {/* JAW Wagmi Hooks - Connect/Disconnect */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            @jaw/wagmi useConnect / useDisconnect
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            These hooks support wallet_connect with capabilities (ERC-7715 permissions)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={handleJawConnect}
              disabled={isConnected || isJawConnecting}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isJawConnecting ? 'Connecting...' : 'JAW Connect'}
            </button>
            <button
              onClick={handleJawConnectWithCapabilities}
              disabled={isConnected || isJawConnecting}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isJawConnecting ? 'Connecting...' : 'JAW Connect + Capabilities'}
            </button>
            <button
              onClick={handleJawDisconnect}
              disabled={!isConnected || isJawDisconnecting}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isJawDisconnecting ? 'Disconnecting...' : 'JAW Disconnect'}
            </button>
          </div>
        </div>

        {/* JAW Wagmi Hooks - Permissions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            @jaw/wagmi Permissions (ERC-7715)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            useGrantPermissions, useRevokePermissions, usePermissions
          </p>

          {/* Spender Address Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Spender Address (required for granting)
            </label>
            <input
              type="text"
              value={spenderAddress}
              onChange={(e) => setSpenderAddress(e.target.value)}
              placeholder="0x... (address that can use the permission)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <button
              onClick={handleGrantPermissions}
              disabled={!isConnected || isGrantingPermissions || !spenderAddress}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isGrantingPermissions ? 'Granting...' : 'Grant Permissions'}
            </button>
            <button
              onClick={handleRevokePermissions}
              disabled={!isConnected || isRevokingPermissions || !permissions?.length}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isRevokingPermissions ? 'Revoking...' : 'Revoke Permissions'}
            </button>
            <button
              onClick={handleFetchPermissions}
              disabled={!isConnected || isLoadingPermissions}
              className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isLoadingPermissions ? 'Loading...' : 'Fetch Permissions'}
            </button>
          </div>
          {grantError && (
            <p className="text-red-600 text-sm mb-2">Grant Error: {grantError.message}</p>
          )}
          {revokeError && (
            <p className="text-red-600 text-sm mb-2">Revoke Error: {revokeError.message}</p>
          )}
          {permissionsError && (
            <p className="text-red-600 text-sm mb-2">Permissions Error: {permissionsError.message}</p>
          )}
          <div className="bg-gray-100 dark:bg-gray-900 rounded p-4 max-h-48 overflow-y-auto">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Current Permissions:
            </p>
            {isLoadingPermissions ? (
              <p className="text-gray-500">Loading...</p>
            ) : permissions && permissions.length > 0 ? (
              <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                {JSON.stringify(permissions, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">No permissions found</p>
            )}
          </div>
        </div>

        {/* Execute with Permissions (EIP-5792) */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            Execute with Permissions (EIP-5792)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Use wallet_sendCalls with a permission ID to execute transactions as the spender
          </p>
          <div className="space-y-4">
            {/* Manual Permission ID Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Permission ID (hex)
              </label>
              <input
                type="text"
                value={manualPermissionId}
                onChange={(e) => setManualPermissionId(e.target.value)}
                placeholder="0xf648169307c0cf5965b2f48cdf9b6765aa445a673fef78bf2e65d37cf213d732"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Enter a permission ID manually, or leave empty to use the first fetched permission
              </p>
            </div>

            {/* Recipient and Amount for sendCalls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              {manualPermissionId ? (
                <span className="text-blue-600">Using manual permission ID: {manualPermissionId.slice(0, 20)}...</span>
              ) : permissions && permissions.length > 0 ? (
                <span className="text-green-600">
                  Using fetched permission: {permissions[0]?.permissionId?.slice(0, 20)}...
                </span>
              ) : (
                <span className="text-orange-600">No permission available - enter one above or fetch permissions</span>
              )}
            </p>

            <button
              onClick={handleSendCallsWithPermission}
              disabled={!isConnected || isSendingCalls || (!manualPermissionId && !permissions?.length)}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSendingCalls ? 'Sending...' : 'Send Calls with Permission'}
            </button>
            {sendCallsError && (
              <p className="text-red-600 text-sm">Send Calls Error: {sendCallsError.message}</p>
            )}
            {sendCallsId && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Batch ID:{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs break-all">
                  {sendCallsId.id}
                </code>
              </p>
            )}
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
                {chain.name} {chainId === chain.id && '✓'}
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
                    wagmiConnect({ connector: c });
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
