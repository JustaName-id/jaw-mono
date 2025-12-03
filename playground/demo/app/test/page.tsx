'use client';

import { useState } from 'react';
import { JAW, Mode } from '@jaw.id/core';
import { parseEther, encodeFunctionData, parseAbi } from 'viem';
import {ReactUIHandler} from "@jaw/ui";

export default function TestPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [chainId, setChainId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [lastPermissionId, setLastPermissionId] = useState<string | null>(null);
  const [sdk] = useState(() =>
      JAW.create({
        appName: 'JAW Playground',
        appLogoUrl: "https://avatars.githubusercontent.com/u/159771991?s=200&v=4",
        defaultChainId: 1,
        preference: {
          keysUrl: 'http://localhost:3001', // Local popup URL
          showTestnets: true,
          // mode: Mode.AppSpecific,
          // uiHandler: new ReactUIHandler()
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
      const provider = sdk.provider;

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

  const handleConnectWithTextRecords = async () => {
    try {
      addLog('Connecting with subnameTextRecords capability...');
      const provider = sdk.provider;

      // Example text records to test
      const testTextRecords = [
        { key: 'email', value: 'test@example.com' },
        { key: 'url', value: 'https://example.com' },
        { key: 'description', value: 'Test account created via SDK' }
      ];

      addLog(`Requesting connection with text records: ${JSON.stringify(testTextRecords)}`);

      const accountsResult = await provider.request({
        method: 'wallet_connect',
        params: [{
          version: '1.0',
          capabilities: {
            subnameTextRecords: testTextRecords
          }
        }]
      });

      console.log('[Demo] wallet_connect result:', accountsResult);

      // Handle WalletConnectResponse format
      let accounts: string[];
      if (Array.isArray(accountsResult)) {
        accounts = accountsResult as string[];
      } else if (accountsResult && typeof accountsResult === 'object' && 'accounts' in accountsResult) {
        const walletConnectResponse = accountsResult as { accounts: { address: string }[] };
        accounts = walletConnectResponse.accounts.map(acc => acc.address);
      } else {
        throw new Error('Unexpected accounts format: ' + JSON.stringify(accountsResult));
      }

      setAccounts(accounts);
      setIsConnected(true);
      console.log('[Demo] Connection successful with text records, accounts stored:', accounts);
      addLog(`✅ Connected with text records! Accounts: ${accounts.join(', ')}`);
      addLog(`📝 Text records will be applied when creating a NEW account: ${JSON.stringify(testTextRecords)}`);

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
      addLog(`❌ Error connecting with text records: ${errorMessage}`);
    }
  };

  const handleConnectWithSiwe = async () => {
    try {
      addLog('🔐 Connecting with SIWE (Sign-In with Ethereum) capability...');
      const provider = sdk.provider;

      // Generate nonce and current chain ID for SIWE
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const currentChainId = chainId || '0x1'; // Default to mainnet if not set

      addLog(`Nonce: ${nonce}`);
      addLog(`Chain ID: ${currentChainId}`);

      const accountsResult = await provider.request({
        method: 'wallet_connect',
        params: [{
          capabilities: {
            signInWithEthereum: {
              nonce,
              chainId: currentChainId,
              statement: 'Sign in to JAW SDK Demo with your Ethereum account',
              // domain and uri will default to current origin in the wallet
            }
          }
        }]
      });

      console.log('[Demo] wallet_connect with SIWE result:', accountsResult);

      // Handle WalletConnectResponse format with SIWE capability response
      type SiweCapabilityResponse = { message: string; signature: string };
      type WalletConnectResponseWithSiwe = {
        accounts: Array<{
          address: string;
          capabilities?: {
            signInWithEthereum?: SiweCapabilityResponse;
          };
        }>;
      };

      let accounts: string[];
      let siweResponse: SiweCapabilityResponse | undefined;

      if (accountsResult && typeof accountsResult === 'object' && 'accounts' in accountsResult) {
        const walletConnectResponse = accountsResult as WalletConnectResponseWithSiwe;
        accounts = walletConnectResponse.accounts.map(acc => acc.address);

        // Extract SIWE response from first account's capabilities
        siweResponse = walletConnectResponse.accounts[0]?.capabilities?.signInWithEthereum;
      } else if (Array.isArray(accountsResult)) {
        accounts = accountsResult as string[];
      } else {
        throw new Error('Unexpected accounts format: ' + JSON.stringify(accountsResult));
      }

      setAccounts(accounts);
      setIsConnected(true);
      console.log('[Demo] Connection with SIWE successful, accounts stored:', accounts);
      addLog(`✅ Connected with SIWE! Account: ${accounts[0]}`);

      if (siweResponse) {
        addLog(`📝 SIWE Message:\n${siweResponse.message}`);
        addLog(`✍️ SIWE Signature: ${siweResponse.signature}`);
        addLog(`🔒 Authentication complete! You can verify this signature server-side.`);
      } else {
        addLog(`⚠️ No SIWE response in capabilities (wallet may not support it)`);
      }

      // Get chain ID
      const chainIdResult = await provider.request({
        method: 'eth_chainId',
        params: []
      });
      setChainId(chainIdResult as string);
      addLog(`Chain ID: ${chainIdResult}`);
    } catch (error) {
      console.error('[Demo] Connection with SIWE error:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error connecting with SIWE: ${errorMessage}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      addLog('Disconnecting...');
      const provider = sdk.provider;
      await provider.request({
        method: 'wallet_disconnect',
        params: []
      });
      setIsConnected(false);
      setAccounts([]);
      setChainId(null);
      setLastBatchId(null);
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
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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

  const handleWalletSign = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const message = 'Hello from JAW SDK Test (wallet_sign)!';
      const provider = sdk.provider;
      addLog(`Requesting wallet_sign signature for message: "${message}"...`);
      addLog(`Using request.type: 0x45 (Personal Sign per EIP-191)`);

      const signature = await provider.request({
        method: 'wallet_sign',
        params: [{
          version: '1.0',
          address: accounts[0],
          request: {
            type: '0x45', // Personal Sign (EIP-191)
            data: { message } // ERC-7871: data must be { message: string } for type 0x45
          }
        }]
      });

      addLog(`Signature: ${signature}`);
    } catch (error) {
      console.error('Wallet sign error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`Error signing with wallet_sign: ${errorMessage}`);
    }
  };

  const handleSiweSign = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      // Generate a proper SIWE (Sign-In with Ethereum) message per EIP-4361
      // https://eips.ethereum.org/EIPS/eip-4361
      const domain = 'localhost:3000';
      const address = accounts[0];
      const statement = 'Sign in to JAW SDK Demo with your Ethereum account';
      const uri = 'http://localhost:3000';
      const version = '1';
      const chainIdNum = parseInt(chainId || '0x1', 16);
      const nonce = Math.random().toString(36).substring(2, 15); // Random nonce
      const issuedAt = new Date().toISOString();

      const siweMessage = `${domain} wants you to sign in with your Ethereum account:
${address}

${statement}

URI: ${uri}
Version: ${version}
Chain ID: ${chainIdNum}
Nonce: ${nonce}
Issued At: ${issuedAt}`;

      const provider = sdk.provider;
      addLog('🔐 Requesting SIWE (Sign-In with Ethereum) signature...');
      addLog('This should open the special SIWE dialog with logo and "Sign in Request" header');

      const signature = await provider.request({
        method: 'personal_sign',
        params: [siweMessage, address]
      });

      addLog(`✅ SIWE Signature: ${signature}`);
    } catch (error) {
      console.error('SIWE sign error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error signing SIWE message: ${errorMessage}`);
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

      const provider = sdk.provider;
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

  const handleWalletSignTypedData = async () => {
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
            name: 'Cow (via wallet_sign)',
            wallet: accounts[0]
          },
          to: {
            name: 'Bob',
            wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
          },
          contents: 'Hello from wallet_sign with type 0x01!'
        }
      };

      const provider = sdk.provider;
      addLog('🔐 Requesting wallet_sign signature for EIP-712 typed data...');
      addLog('Using request.type: 0x01 (Structured Data per EIP-191/EIP-712)');

      const signature = await provider.request({
        method: 'wallet_sign',
        params: [{
          version: '1.0',
          address: accounts[0],
          request: {
            type: '0x01', // Structured Data (EIP-712)
            data: JSON.stringify(typedData)
          }
        }]
      });

      addLog(`✅ Typed data signature (wallet_sign): ${signature}`);
    } catch (error) {
      console.error('Wallet sign typed data error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error signing with wallet_sign (type 0x01): ${errorMessage}`);
    }
  };

  const handleSendTransaction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('Sending ETH transaction (eth_sendTransaction)...');

      // Example: Send 0.001 ETH to a recipient
      // Use viem's parseEther to convert ETH to wei
      const value = parseEther('0.0001');

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0', // Example recipient
          value: `0x${value.toString(16)}`, // Convert bigint to hex
          data: '0x', // No data for simple ETH transfer
        }]
      });

      addLog(`✅ Transaction hash: ${txHash}`);
      addLog(`View on explorer: https://etherscan.io/tx/${txHash}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error sending transaction: ${errorMessage}`);
    }
  };

  const handleSendBatchTransaction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('Sending batch transaction (wallet_sendCalls - EIP-5792)...');

      // Example: Batch multiple calls atomically
      // 1. Send ETH to recipient
      // 2. Call a contract function (ERC20 transfer)

      // Prepare values using viem
      const ethValue = parseEther('0.0001');

      // Encode ERC20 transfer function call: transfer(address recipient, uint256 amount)
      const erc20Abi = parseAbi([
        'function transfer(address to, uint256 amount) returns (bool)'
      ]);

      const transferData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [
          '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0', // Recipient
          BigInt(1000000) // 1 USDC (6 decimals)
        ]
      });

      // Get current chain ID for optional parameter
      const currentChainId = chainId ? parseInt(chainId, 16) : undefined;

      const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          from: accounts[0],
          calls: [
            // Call 1: Send 0.001 ETH
            {
              to: '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0',
              value: `0x${ethValue.toString(16)}`,
              data: '0x',
            },
            // Call 2: ERC20 transfer (properly encoded with viem)
            {
              to: '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0',
              value: `0x${ethValue.toString(16)}`,
              data: '0x',
            },
          ],
          atomicRequired: true, // All calls must succeed or all fail
        }]
      });

      addLog(`[Demo] Batch transaction result: ${JSON.stringify(result)}`);
      console.log('[Demo] Batch transaction result:', result);

      // Extract batch ID from result
      const batchId = typeof result === 'object' && result !== null && 'id' in result
          ? (result as { id: string }).id
          : null;

      if (batchId) {
        setLastBatchId(batchId);
        addLog(`✅ Batch transaction submitted! Batch ID: ${batchId}`);
        addLog('Note: All calls executed atomically in a single user operation');
        addLog('Use "Get Calls Status" button to check transaction status');
      } else {
        addLog(`✅ Batch transaction result: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error sending batch transaction: ${errorMessage}`);
    }
  };

  const handleSendContractInteraction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('Sending contract interaction (eth_sendTransaction)...');

      // Example: ERC20 approve function using viem
      const erc20Abi = parseAbi([
        'function approve(address spender, uint256 amount) returns (bool)'
      ]);

      const spenderAddress = '0x1111111254EEB25477B68fb85Ed929f73A960582'; // 1inch Router
      const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

      // Encode function call using viem
      const approveData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [spenderAddress, maxUint256]
      });

      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: accounts[0],
          to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC contract
          value: '0x0',
          data: approveData,
        }]
      });

      addLog(`✅ Contract interaction hash: ${txHash}`);
      addLog(`Function: approve(spender, amount)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error in contract interaction: ${errorMessage}`);
    }
  };

  const handleSignTransaction = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('Requesting transaction signature...');
      const signedTx = await provider.request({
        method: 'eth_signTransaction',
        params: [{
          from: accounts[0],
          to: '0xe08224b2cfaf4f27e2dc7cb3f6b99acc68cf06c0',
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
      const provider = sdk.provider;
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

  const handleGetCallsStatus = async () => {
    if (!lastBatchId) {
      addLog('No batch ID available. Send a batch transaction first.');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog(`Checking status for batch ID: ${lastBatchId}...`);

      const status = await provider.request({
        method: 'wallet_getCallsStatus',
        params: [lastBatchId]
      });
      console.log('[Demo] Calls status:', status);

      // Status format: { id: string, status: number, receipts: unknown[] }
      // Status codes: 100 = pending, 200 = completed, 400 = failed
      const statusObj = status as { id: string; status: number; receipts: unknown[] };
      const statusText = statusObj.status === 100
          ? 'pending'
          : statusObj.status === 200
              ? 'completed'
              : statusObj.status === 400
                  ? 'failed'
                  : `unknown (${statusObj.status})`;

      addLog(`Batch ID: ${statusObj.id}`);
      addLog(`Status: ${statusText} (code: ${statusObj.status})`);

      if (statusObj.receipts && statusObj.receipts.length > 0) {
        addLog(`Receipts: ${JSON.stringify(statusObj.receipts, null, 2)}`);
      } else {
        addLog('No receipts available yet');
      }
    } catch (error) {
      console.error('[Demo] Get calls status error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`Error getting calls status: ${errorMessage}`);
    }
  };

  const handleWatchAsset = async () => {
    try {
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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

  const handleGetAssets = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog(`Requesting assets for account: ${accounts[0]}...`);

      const assets = await provider.request({
        method: 'wallet_getAssets',
        params: [{
          account: accounts[0]
        }]
      });

      console.log('[Demo] Assets received:', assets);
      addLog(`Assets: ${JSON.stringify(assets, null, 2)}`);

      // Count assets per chain
      if (assets && typeof assets === 'object') {
        const assetsObj = assets as Record<string, unknown[]>;
        Object.entries(assetsObj).forEach(([chainId, chainAssets]) => {
          if (Array.isArray(chainAssets)) {
            addLog(`Chain ${chainId}: ${chainAssets.length} asset(s) found`);
          }
        });
      }
    } catch (error) {
      console.error('[Demo] Get assets error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`Error getting assets: ${errorMessage}`);
    }
  };

  const handleGetCoinbase = async () => {
    try {
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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
      const provider = sdk.provider;
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

  const handleGrantPermissions = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('🔑 Requesting permissions grant (wallet_grantPermissions)...');

      // Example spender address (could be a dApp contract)
      const spenderAddress = '0xE08224B2CfaF4f27E2DC7cB3f6B99AcC68Cf06c0';

      // Example: Grant multiple permissions (spend + calls) for 30 days
      const ethLimit = parseEther('0.0001'); // 0.0001 ETH per day
      const expiryTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days from now

      const currentChainId = chainId || '0x1';

      addLog(`Granting multiple permissions to spender: ${spenderAddress}`);
      addLog(`1. Spend: 0.0001 ETH per day`);
      addLog(`2. Call: transfer(address,uint256) on any contract`);
      addLog(`Expiry: ${new Date(expiryTimestamp * 1000).toISOString()}`);

      const result = await provider.request({
        method: 'wallet_grantPermissions',
        params: [{
          address: accounts[0],
          chainId: currentChainId,
          expiry: expiryTimestamp,
          spender: spenderAddress,
          permissions: {
            spends: [
              {
                limit: `0x${ethLimit.toString(16)}`,
                period: 'day' as const,
                token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' // Native token (ETH)
              }
            ],
            calls: [
              {
                target: spenderAddress,
               selector: '0x32323232'
              }
            ]
          }
        }]
      });

      console.log('[Demo] Grant permissions result:', result);

      if (result && typeof result === 'object' && 'id' in result) {
        const response = result as { id: string; address: string; spender: string };
        setLastPermissionId(response.id);
        addLog(`✅ Permissions granted successfully!`);
        addLog(`Permission ID: ${response.id}`);
        addLog(`Full response: ${JSON.stringify(result, null, 2)}`);
      } else {
        addLog(`✅ Permission result: ${JSON.stringify(result, null, 2)}`);
      }
    } catch (error) {
      console.error('[Demo] Grant permissions error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error granting permissions: ${errorMessage}`);
    }
  };

  const handleGrantPermissionsBaseSepolia = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('🔑 Requesting permissions grant for multiple ERC-20s on Base Sepolia...');

      // Example spender address
      const spenderAddress = '0xE08224B2CfaF4f27E2DC7cB3f6B99AcC68Cf06c0';

      // USDC on Base Sepolia (6 decimals)
      const usdcAddress = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

      // DAI on Base Sepolia (18 decimals) - example
      const daiAddress = '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb';

      // 1 USDC with 6 decimals = 1 * 10^6 = 1000000
      const usdcLimit = BigInt(1_000_000);

      // 10 DAI with 18 decimals
      const daiLimit = parseEther('10');

      const expiryTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

      // Base Sepolia chain ID
      const baseSepoliaChainId = '0x14a34'; // 84532 in hex

      addLog(`Chain: Base Sepolia (${baseSepoliaChainId})`);
      addLog(`Spender: ${spenderAddress}`);
      addLog(`Permissions:`);
      addLog(`  1. Spend: 1 USDC per day (${usdcAddress})`);
      addLog(`  2. Spend: 10 DAI per week (${daiAddress})`);
      addLog(`  3. Call: approve(address,uint256) on any contract`);
      addLog(`Expiry: ${new Date(expiryTimestamp * 1000).toISOString()}`);

      const result = await provider.request({
        method: 'wallet_grantPermissions',
        params: [{
          address: accounts[0],
          chainId: baseSepoliaChainId,
          expiry: expiryTimestamp,
          spender: spenderAddress,
          permissions: {
            spends: [
              {
                limit: `0x${usdcLimit.toString(16)}`,
                period: 'day' as const,
                token: usdcAddress
              },
            ],
            calls: [
              {
                target: spenderAddress,
                functionSignature: 'transfer(address,uint256)',
              }
            ]
          }
        }]
      });

      console.log('[Demo] Grant multiple ERC-20 permissions result:', result);

      if (result && typeof result === 'object' && 'id' in result) {
        const response = result as { id: string; address: string; spender: string };
        setLastPermissionId(response.id);
        addLog(`✅ Multiple permissions granted successfully!`);
        addLog(`Permission ID: ${response.id}`);
        addLog(`Full response: ${JSON.stringify(result, null, 2)}`);
      } else {
        addLog(`✅ Permission result: ${JSON.stringify(result, null, 2)}`);
      }
    } catch (error) {
      console.error('[Demo] Grant ERC-20 permissions error:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error granting ERC-20 permissions: ${errorMessage}`);
    }
  };

  const handleGetPermissions = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog(`📋 Requesting permissions list for account: ${accounts[0]}...`);

      const permissions = await provider.request({
        method: 'wallet_getPermissions',
        params: [{
          address: accounts[0]
        }]
      });

      console.log('[Demo] Permissions received:', permissions);
      addLog(`Permissions: ${JSON.stringify(permissions, null, 2)}`);

      // Count permissions if it's an array
      if (Array.isArray(permissions)) {
        addLog(`✅ Found ${permissions.length} permission(s)`);

        // If no lastPermissionId is set and permissions exist, set the first one
        if (!lastPermissionId && permissions.length > 0) {
          const firstPermission = permissions[0] as { id?: string };
          if (firstPermission && firstPermission.id) {
            setLastPermissionId(firstPermission.id);
            addLog(`📌 Auto-set first permission as lastPermissionId: ${firstPermission.id}`);
            addLog(`You can now use "Revoke Permissions" button to test revoke functionality`);
          }
        }
      } else {
        addLog(`✅ Permissions retrieved successfully`);
      }
    } catch (error) {
      console.error('[Demo] Get permissions error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error getting permissions: ${errorMessage}`);
    }
  };

  const handleRevokePermissions = async () => {
    if (!lastPermissionId) {
      addLog('No permission ID available. Grant permissions first.');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog(`🚫 Revoking permission with ID: ${lastPermissionId}...`);

      const result = await provider.request({
        method: 'wallet_revokePermissions',
        params: [{
          address: accounts[0],
          id: lastPermissionId as `0x${string}`
        }]
      });

      console.log('[Demo] Revoke permissions result:', result);
      addLog(`✅ Permission revoked successfully!`);
      addLog(`Result: ${JSON.stringify(result, null, 2)}`);

      // Clear the stored permission ID
      setLastPermissionId(null);
    } catch (error) {
      console.error('[Demo] Revoke permissions error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`❌ Error revoking permissions: ${errorMessage}`);
    }
  };

  const handleTestUnsupportedMethod = async () => {
    if (accounts.length === 0) {
      addLog('No accounts connected');
      return;
    }

    try {
      const provider = sdk.provider;
      addLog('🧪 Testing unsupported method...');
      addLog('This should open the UnsupportedMethodModal in the popup');

      // Use wallet_sign with an unsupported type code
      // This will be forwarded to the popup since it's wallet_sign,
      // but the type 0x99 is not implemented, triggering unsupported method
      const result = await provider.request({
        method: 'wallet_sign',
        params: [{
          version: '1.0',
          address: accounts[0],
          request: {
            type: '0x99', // Unsupported type - not 0x01 (typed data) or 0x45 (personal sign)
            data: 'test data'
          }
        }]
      });

      addLog(`Unexpected success: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error('Unsupported method error details:', error);
      const errorMessage = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : typeof error === 'object' && error !== null
                  ? JSON.stringify(error, null, 2)
                  : String(error);
      addLog(`✅ Got error (check if modal appeared): ${errorMessage}`);
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                  onClick={handleConnect}
                  disabled={isConnected}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Connect (eth_requestAccounts)
              </button>
              <button
                  onClick={handleConnectWithSiwe}
                  disabled={isConnected}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Connect with SIWE
              </button>
              <button
                  onClick={handleConnectWithTextRecords}
                  disabled={isConnected}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Connect with Text Records
              </button>
              <button
                  onClick={handleDisconnect}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Disconnect
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Connect with SIWE:</span> Uses <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">wallet_connect</code> with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">signInWithEthereum</code> capability. The wallet constructs and signs the SIWE message during connection (ERC-7846). Returns both the message and signature for server-side verification.
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Connect with Text Records:</span> Uses <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">subnameTextRecords</code> capability. Text records will be applied when creating a <span className="font-medium">NEW account</span> during onboarding.
              </p>
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
              <button
                  onClick={handleGetCallsStatus}
                  disabled={!isConnected || !lastBatchId}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Get Calls Status
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
                Sign Message (personal_sign)
              </button>
              <button
                  onClick={handleWalletSign}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Wallet Sign (0x45)
              </button>
              <button
                  onClick={handleSiweSign}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Sign-In with Ethereum (SIWE)
              </button>
              <button
                  onClick={handleSignTypedData}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Sign Typed Data (eth_signTypedData_v4)
              </button>
              <button
                  onClick={handleWalletSignTypedData}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Wallet Sign Typed Data (0x01)
              </button>
              <button
                  onClick={handleSignTransaction}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Sign Transaction
              </button>
            </div>
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Note:</span> Both <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">eth_signTypedData_v4</code> and <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">wallet_sign (type 0x01)</code> perform EIP-712 typed data signing. The difference is in the parameter format: eth_signTypedData_v4 uses standard params, while wallet_sign uses a structured format with type specification per EIP-191.
              </p>
            </div>
          </div>

          {/* Transaction Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Transaction Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                  onClick={handleSendTransaction}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Send ETH (eth_sendTransaction)
              </button>
              <button
                  onClick={handleSendContractInteraction}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Contract Call (ERC20 Approve)
              </button>
              <button
                  onClick={handleSendBatchTransaction}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Batch Transaction (wallet_sendCalls)
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Note:</span> wallet_sendCalls (EIP-5792) executes multiple calls atomically in a single user operation. Returns a batch ID that can be used with wallet_getCallsStatus to check transaction status.
              </p>
              {lastBatchId && (
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    <span className="font-medium">Last Batch ID:</span> <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{lastBatchId}</code>
                  </p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Test Networks:</span> This demo uses Sepolia and Base Sepolia testnets. Get test ETH from faucets before testing transactions.
              </p>
            </div>
          </div>

          {/* Wallet Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Wallet Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                  onClick={handleGetAssets}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Get Assets (wallet_getAssets)
              </button>
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
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Note:</span> wallet_getAssets (EIP-7811) retrieves assets across all supported chains. The chainFilter is automatically set based on the showTestnets preference (default: mainnet chains only).
              </p>
            </div>
          </div>

          {/* Permissions Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Permissions Actions
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                  onClick={handleGrantPermissions}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Grant Permissions (ETH)
              </button>
              <button
                  onClick={handleGrantPermissionsBaseSepolia}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Grant Permissions (USDC)
              </button>
              <button
                  onClick={handleGetPermissions}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Get Permissions
              </button>
              <button
                  onClick={handleRevokePermissions}
                  disabled={!isConnected || !lastPermissionId}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Revoke Permissions
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Note:</span> Permissions allow a dApp or contract (spender) to spend tokens on behalf of your account within specified limits and time periods. This test grants permission to spend 0.0001 ETH per day for 30 days.
              </p>
              {lastPermissionId && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <span className="font-medium">Last Permission ID:</span> <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{lastPermissionId}</code>
                  </p>
              )}
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Test Flow:</span> 1) Grant Permissions → 2) Get Permissions to verify → 3) Revoke Permissions when done
              </p>
            </div>
          </div>

          {/* Testing & Edge Cases */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Testing & Edge Cases
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button
                  onClick={handleTestUnsupportedMethod}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Test Unsupported Method
              </button>
            </div>
            <div className="mt-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">Note:</span> This button tests the UnsupportedMethodModal by calling <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">wallet_sign</code> with an unsupported type code (<code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">0x99</code>). This will open the popup and show the UnsupportedMethodModal with the method details.
              </p>
            </div>
          </div>

          {/* Chain Switching */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Switch Chain
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                  onClick={() => handleSwitchChain('0xaa36a7')}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Sepolia (0xaa36a7)
              </button>
              <button
                  onClick={() => handleSwitchChain('0x14a34')}
                  disabled={!isConnected}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Base Sepolia (0x14a34)
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