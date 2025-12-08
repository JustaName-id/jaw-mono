/**
 * Server-side playground for Account class
 *
 * Run with: npx tsx server.ts
 *
 * Note: Account.create() requires WebAuthn/passkeys (browser only).
 * For server-side, use Account.fromLocalAccount() with a private key.
 */
import 'dotenv/config';
import { Account, type TransactionCall } from '@jaw.id/core';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { parseEther, formatEther, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

// Configuration (loaded from .env)
const API_KEY = process.env.NEXT_PUBLIC_API_KEY!;
const CHAIN_ID = 84532; // Base Sepolia

if (!API_KEY) {
  throw new Error('NEXT_PUBLIC_API_KEY is required in .env');
}

async function main() {
  console.log('='.repeat(60));
  console.log('Account Class Playground');
  console.log('='.repeat(60));

  // Option 1: Use existing private key from env
  const existingKey = process.env.NEXT_PUBLIC_PRIVATE_KEY as `0x${string}`;

  // Option 2: Generate a new private key (creates a new account each time)
  const newKey = generatePrivateKey();

  // Choose which key to use
  const PRIVATE_KEY = existingKey || newKey;

  console.log('\n--- Creating Account ---');
  if (!existingKey) {
    console.log('Generated new private key:', PRIVATE_KEY);
  }

  // Create a local signer from private key
  const localAccount = privateKeyToAccount(PRIVATE_KEY);
  console.log('Signer (EOA) address:', localAccount.address);

  // Create smart account - this derives a deterministic smart account address
  // from the signer. The smart account is created on-chain on first transaction.
  const account = await Account.fromLocalAccount(
    { chainId: CHAIN_ID, apiKey: API_KEY },
    localAccount
  );

  console.log('Smart Account address:', account.address);
  console.log('Chain ID:', account.chainId);

  // Get chain info
  const chain = account.getChain();
  console.log('RPC URL:', chain.rpcUrl);

  // Fund the smart account from the EOA if needed
  const walletClient = createWalletClient({
    account: localAccount,
    chain: baseSepolia,
    transport: http(),
  });

  // Check smart account balance and fund if needed
  const { createPublicClient } = await import('viem');
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const smartAccountBalance = await publicClient.getBalance({ address: account.address });
  console.log('\nSmart Account balance:', formatEther(smartAccountBalance), 'ETH');

  if (smartAccountBalance < parseEther('0.01')) {
    console.log('Funding smart account with 0.1 ETH from EOA...');
    const fundTxHash = await walletClient.sendTransaction({
      to: account.address,
      value: parseEther('0.1'),
    });
    console.log('Fund tx hash:', fundTxHash);
    await publicClient.waitForTransactionReceipt({ hash: fundTxHash });
    console.log('Smart account funded!');
  }

  // Example: Sign a message
  console.log('\n--- Signing Message ---');
  const message = 'Hello from JAW Account!';
  const signature = await account.signMessage(message);
  console.log('Message:', message);
  console.log('Signature:', signature);

  // Example: Sign typed data (EIP-712)
  console.log('\n--- Signing Typed Data ---');
  const typedDataSignature = await account.signTypedData({
    domain: {
      name: 'JAW Playground',
      version: '1',
      chainId: BigInt(CHAIN_ID),
    },
    types: {
      Message: [
        { name: 'content', type: 'string' },
        { name: 'timestamp', type: 'uint256' },
      ],
    },
    primaryType: 'Message',
    message: {
      content: 'Hello typed data!',
      timestamp: BigInt(Date.now()),
    },
  });
  console.log('Typed data signature:', typedDataSignature);

  // Example: Estimate gas for a transaction
  console.log('\n--- Gas Estimation ---');
  const testCalls: TransactionCall[] = [
    {
      to: localAccount.address, // Send to self
      value: parseEther('0.0001'),
      data: '0x',
    },
  ];

  try {
    const estimatedGas = await account.estimateGas(testCalls);
    console.log('Estimated gas:', estimatedGas.toString());

    const gasCost = await account.calculateGasCost(testCalls);
    console.log('Gas cost in ETH:', gasCost);
  } catch (error) {
    console.log('Gas estimation error:', (error as Error).message);
  }

  // ============================================
  // Test: sendTransaction (waits for receipt)
  // ============================================
  console.log('\n--- Send Transaction (with receipt) ---');
  try {
    const txHash = await account.sendTransaction([
      { to: localAccount.address, value: parseEther('0.0001') },
    ]);
    console.log('Transaction hash:', txHash);
    console.log('View on BaseScan: https://sepolia.basescan.org/tx/' + txHash);
  } catch (error) {
    console.log('sendTransaction error:', (error as Error).message);
  }

  // ============================================
  // Test: sendCalls (batch, returns immediately)
  // ============================================
  console.log('\n--- Send Batch Calls (async) ---');
  try {
    const { id: userOpHash, chainId: resultChainId } = await account.sendCalls([
      { to: localAccount.address, value: parseEther('0.00005') },
      { to: localAccount.address, value: parseEther('0.00005') },
    ]);
    console.log('UserOp hash:', userOpHash);
    console.log('Chain ID:', resultChainId);

    // Check status immediately
    console.log('\nChecking call status...');
    let status = account.getCallStatus(userOpHash);
    console.log('Initial status:', status?.status, '(100=pending, 200=completed, 400=failed)');

    // Poll for completion
    let attempts = 0;
    while (status?.status === 100 && attempts < 30) {
      await new Promise((r) => setTimeout(r, 2000));
      status = account.getCallStatus(userOpHash);
      console.log('Status:', status?.status);
      attempts++;
    }

    if (status?.status === 200 && status.receipts) {
      console.log('Batch completed! Tx hash:', status.receipts[0].transactionHash);
    }
  } catch (error) {
    console.log('sendCalls error:', (error as Error).message);
  }

  // ============================================
  // Test: Grant Permissions
  // ============================================
  console.log('\n--- Grant Permissions ---');
  try {
    // Create a random spender address for testing
    const spenderAccount = privateKeyToAccount(generatePrivateKey());
    const spenderAddress = spenderAccount.address;
    console.log('Spender address:', spenderAddress);

    const permissionResponse = await account.grantPermissions(
      Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
      spenderAddress,
      {
        calls: [
          {
            target: '0x0000000000000000000000000000000000000000', // Any target for demo
            selector: '0x00000000', // Any selector
          },
        ],
        spends: [], // No spend limits for this test
      }
    );
    console.log('Permission granted!');
    console.log('Permission ID:', permissionResponse.id);
    console.log('Expiry:', new Date(permissionResponse.expiry * 1000).toISOString());

    // ============================================
    // Test: Get Permission details
    // ============================================
    console.log('\n--- Get Permission Details ---');
    const permissionDetails = await account.getPermission(permissionResponse.id);
    console.log('Permission details:');
    console.log('  Address:', permissionDetails.address);
    console.log('  Spender:', permissionDetails.spender);
    console.log('  Expiry:', new Date(permissionDetails.expiry * 1000).toISOString());
    console.log('  Calls:', permissionDetails.calls);

    // ============================================
    // Test: Revoke Permission
    // ============================================
    console.log('\n--- Revoke Permission ---');
    const revokeResponse = await account.revokePermission(permissionResponse.id);
    console.log('Permission revoked!');
    console.log('Response:', revokeResponse);
  } catch (error) {
    console.log('Permissions error:', (error as Error).message);
  }

  // ============================================
  // Test: getAddress (async)
  // ============================================
  console.log('\n--- Get Address (async) ---');
  const asyncAddress = await account.getAddress();
  console.log('Address (async):', asyncAddress);

  // ============================================
  // Test: getSmartAccount (advanced)
  // ============================================
  console.log('\n--- Get Smart Account (advanced) ---');
  const smartAccount = account.getSmartAccount();
  console.log('SmartAccount type:', smartAccount.type);

  // ============================================
  // Test: getMetadata (for passkey accounts only)
  // ============================================
  console.log('\n--- Get Metadata ---');
  const metadata = account.getMetadata();
  console.log('Metadata:', metadata || '(null - only available for passkey accounts)');

  console.log('\n' + '='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));
}

main().catch(console.error);
