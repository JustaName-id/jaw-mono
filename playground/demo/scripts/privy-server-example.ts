/**
 * Privy Server Wallet + JAW Example
 *
 * This script demonstrates using Privy Server Wallets as key management
 * for JAW smart accounts on the server side.
 *
 * Usage:
 *   PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx JAW_API_KEY=xxx npx tsx scripts/privy-server-example.ts
 *
 * Or with bun:
 *   PRIVY_APP_ID=xxx PRIVY_APP_SECRET=xxx JAW_API_KEY=xxx bun scripts/privy-server-example.ts
 *
 * @see https://docs.privy.io/guide/server-wallets/usage/ethereum
 */

import { PrivyClient } from '@privy-io/server-auth';
import { createViemAccount } from '@privy-io/server-auth/viem';
import { Account } from '@jaw.id/core';
import { parseEther } from 'viem';

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const JAW_API_KEY = process.env.JAW_API_KEY || process.env.NEXT_PUBLIC_API_KEY;
const CHAIN_ID = 84532; // Base Sepolia

async function main() {
    // Validate environment
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET || !JAW_API_KEY) {
        console.error('Missing required environment variables:');
        console.error('  PRIVY_APP_ID (or NEXT_PUBLIC_PRIVY_APP_ID)');
        console.error('  PRIVY_APP_SECRET');
        console.error('  JAW_API_KEY (or NEXT_PUBLIC_API_KEY)');
        process.exit(1);
    }

    console.log('🔐 Initializing Privy client...');
    const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);

    // Step 1: Create a server wallet
    console.log('\n📝 Creating Privy server wallet...');

    const wallet = await privy.walletApi.create({
        chainType: 'ethereum',
    });
    
    // Or Load wallet from privy
    // const wallet = await privy.walletApi.getWallet({
    //     id: "kp9916d1on58m59xz2g60zo6"
    // })
    console.log(`   Wallet ID: ${wallet.id}`);
    console.log(`   Address: ${wallet.address}`);

    // Step 2: Get viem-compatible LocalAccount from Privy
    // Uses Privy's createViemAccount helper from @privy-io/server-auth/viem
    console.log('\n🔗 Creating viem LocalAccount from Privy server wallet...');
    const localAccount = await createViemAccount({
        walletId: wallet.id,
        address: wallet.address as `0x${string}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        privy: privy as any, // Type assertion needed due to potential version mismatch
    });
    console.log(`   LocalAccount address: ${localAccount.address}`);
    console.log(`   LocalAccount type: ${localAccount.type}`);

    // Step 3: Create JAW smart account using the Privy wallet as signer
    console.log('\n🚀 Creating JAW smart account...');
    const account = await Account.fromLocalAccount(
        { chainId: CHAIN_ID, apiKey: JAW_API_KEY },
        localAccount
    );
    console.log(`   Smart Account address: ${account.address}`);
    console.log(`   Chain ID: ${account.chainId}`);

    // Step 4: Sign a message (server-side, no user interaction)
    console.log('\n✍️  Signing a message...');
    const message = `Server-side signing test\nTimestamp: ${new Date().toISOString()}`;
    const signature = await account.signMessage(message);
    console.log(`   Message: "${message.replace(/\n/g, '\\n')}"`);
    console.log(`   Signature: ${signature.slice(0, 66)}...`);

    // Step 5: Send a test transaction (0.0001 ETH to self)
    console.log('\n💸 Sending test transaction (0.0001 ETH to self)...');
    try {
        const txHash = await account.sendTransaction([
            {
                to: account.address,
                value: parseEther('0.0001'),
                data: '0x',
            },
        ]);
        console.log(`   Transaction hash: ${txHash}`);
        console.log(`   Explorer: https://sepolia.basescan.org/tx/${txHash}`);
    } catch (err) {
        console.log(`   Transaction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        console.log('\n💰 To send transactions, fund the smart account:');
        console.log(`   Address: ${account.address}`);
        console.log(`   Network: Base Sepolia`);
        console.log(`   Faucet: https://www.alchemy.com/faucets/base-sepolia`);
    }

    console.log('\n✅ Done! Privy Server Wallet + JAW integration working.');
}

main().catch(console.error);
