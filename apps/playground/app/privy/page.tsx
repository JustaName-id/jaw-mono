'use client';

import { useState, useEffect } from 'react';
import { PrivyProvider, usePrivy, useWallets, toViemAccount } from '@privy-io/react-auth';
import { Account } from '@jaw.id/core';
import { parseEther } from 'viem';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
const JAW_API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
const CHAIN_ID = 84532; // Base Sepolia

function PrivyJAWDemo() {
  const { login, logout, authenticated, user, ready, createWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const [jawAccount, setJawAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [creatingWallet, setCreatingWallet] = useState(false);

  // Find the Privy embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');

  // Create embedded wallet if user is authenticated but doesn't have one
  useEffect(() => {
    const createEmbeddedWallet = async () => {
      if (authenticated && walletsReady && !embeddedWallet && !creatingWallet) {
        setCreatingWallet(true);
        try {
          await createWallet();
        } catch (err) {
          console.error('Failed to create wallet:', err);
          // Wallet might already exist, ignore error
        } finally {
          setCreatingWallet(false);
        }
      }
    };
    createEmbeddedWallet();
  }, [authenticated, walletsReady, embeddedWallet, creatingWallet, createWallet]);

  // Initialize JAW Account from Privy wallet
  const initJAWAccount = async () => {
    if (!embeddedWallet) {
      setError('No embedded wallet found. Please login first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert Privy wallet to viem LocalAccount
      const localAccount = await toViemAccount({ wallet: embeddedWallet });

      // Create JAW Account from LocalAccount
      const account = await Account.fromLocalAccount(
        { chainId: CHAIN_ID, apiKey: JAW_API_KEY },
        localAccount
      );

      setJawAccount(account);
      console.log('JAW Smart Account created:', account.address);
    } catch (err) {
      console.error('Failed to create JAW account:', err);
      setError(err instanceof Error ? err.message : 'Failed to create JAW account');
    } finally {
      setLoading(false);
    }
  };

  // Sign a message
  const handleSignMessage = async () => {
    if (!jawAccount) return;

    setLoading(true);
    setError(null);
    setSignature(null);

    try {
      const message = `Hello from JAW + Privy!\n\nTimestamp: ${new Date().toISOString()}`;
      const sig = await jawAccount.signMessage(message);
      setSignature(sig);
      console.log('Signature:', sig);
    } catch (err) {
      console.error('Failed to sign message:', err);
      setError(err instanceof Error ? err.message : 'Failed to sign message');
    } finally {
      setLoading(false);
    }
  };

  // Send a test transaction (0 ETH to self)
  const handleSendTransaction = async () => {
    if (!jawAccount) return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const hash = await jawAccount.sendTransaction([
        {
          to: jawAccount.address,
          value: parseEther('0.0001'), // Send 0.0001 ETH to self
          data: '0x',
        },
      ]);
      setTxHash(hash);
      console.log('Transaction hash:', hash);
    } catch (err) {
      console.error('Failed to send transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to send transaction');
    } finally {
      setLoading(false);
    }
  };

  // Auto-initialize JAW account when wallet is ready
  useEffect(() => {
    if (authenticated && walletsReady && embeddedWallet && !jawAccount && !loading && !creatingWallet) {
      initJAWAccount();
    }
  }, [authenticated, walletsReady, embeddedWallet, jawAccount, loading, creatingWallet]);

  // Reset state on logout
  useEffect(() => {
    if (!authenticated) {
      setJawAccount(null);
      setTxHash(null);
      setSignature(null);
      setError(null);
    }
  }, [authenticated]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading Privy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Privy + JAW Account Demo</h1>
        <p className="text-gray-400 mb-8">
          Using Privy embedded wallet as signer for JAW Smart Account
        </p>

        {/* Login Section */}
        {!authenticated ? (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Step 1: Login with Privy</h2>
            <p className="text-gray-400 mb-4">
              Login with email or social to get an embedded wallet
            </p>
            <button
              onClick={login}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
            >
              Login with Privy
            </button>
          </div>
        ) : (
          <>
            {/* User Info */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">Privy User</h2>
                  <p className="text-gray-400 text-sm">
                    {user?.email?.address || user?.google?.email || user?.twitter?.username || 'Connected'}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  Logout
                </button>
              </div>

              {/* Embedded Wallet */}
              {embeddedWallet && (
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-sm text-gray-400 mb-1">Embedded Wallet (EOA Signer)</p>
                  <p className="font-mono text-sm break-all">{embeddedWallet.address}</p>
                </div>
              )}
            </div>

            {/* JAW Account Section */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Step 2: JAW Smart Account</h2>

              {(!walletsReady || creatingWallet) ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  <span className="text-gray-400">
                    {creatingWallet ? 'Creating embedded wallet...' : 'Loading wallets...'}
                  </span>
                </div>
              ) : !embeddedWallet ? (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm">
                    No embedded wallet found. Please try logging out and back in.
                  </p>
                </div>
              ) : loading && !jawAccount ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                  <span className="text-gray-400">Creating smart account...</span>
                </div>
              ) : jawAccount ? (
                <div className="space-y-4">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-1">Smart Account Address</p>
                    <p className="font-mono text-sm break-all">{jawAccount.address}</p>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-1">Chain ID</p>
                    <p className="font-mono text-sm">{jawAccount.chainId} (Sepolia)</p>
                  </div>
                  <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                    <p className="text-green-400 text-sm">
                      Smart account created successfully! The Privy embedded wallet is now the owner/signer of this JAW smart account.
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={initJAWAccount}
                  className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
                >
                  Create JAW Account
                </button>
              )}
            </div>

            {/* Actions Section */}
            {jawAccount && (
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Step 3: Test Actions</h2>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    onClick={handleSignMessage}
                    disabled={loading}
                    className="py-3 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    {loading ? 'Signing...' : 'Sign Message'}
                  </button>
                  <button
                    onClick={handleSendTransaction}
                    disabled={loading}
                    className="py-3 px-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                  >
                    {loading ? 'Sending...' : 'Send Transaction'}
                  </button>
                </div>

                <p className="text-gray-500 text-sm">
                  Note: Transactions require Sepolia ETH in your smart account. Get some from a faucet.
                </p>
              </div>
            )}

            {/* Results Section */}
            {(signature || txHash) && (
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Results</h2>

                {signature && (
                  <div className="bg-gray-700/50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-400 mb-1">Signature</p>
                    <p className="font-mono text-xs break-all text-purple-400">{signature}</p>
                  </div>
                )}

                {txHash && (
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-1">Transaction Hash</p>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs break-all text-green-400 hover:underline"
                    >
                      {txHash}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Error Section */}
            {error && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
          </>
        )}

        {/* Info Section */}
        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="font-semibold mb-2">How it works</h3>
          <ol className="text-gray-400 text-sm space-y-2 list-decimal list-inside">
            <li>Privy creates an embedded wallet (EOA) when you login</li>
            <li>We convert it to a viem LocalAccount using <code className="text-blue-400">toViemAccount()</code></li>
            <li>JAW creates a smart account with the Privy wallet as the owner/signer</li>
            <li>All transactions are signed by Privy, executed by JAW smart account</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Wrap with PrivyProvider
export default function PrivyPage() {
  if (!PRIVY_APP_ID) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center max-w-md p-6">
          <h1 className="text-2xl font-bold mb-4 text-red-500">Missing Privy App ID</h1>
          <p className="text-gray-400 mb-4">
            Please add <code className="bg-gray-800 px-2 py-1 rounded">NEXT_PUBLIC_PRIVY_APP_ID</code> to your .env file
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
        },
      }}
    >
      <PrivyJAWDemo />
    </PrivyProvider>
  );
}
