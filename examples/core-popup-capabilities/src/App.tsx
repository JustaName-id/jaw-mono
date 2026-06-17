import { useState } from 'react';
import { JAW } from '@jaw.id/core';

/**
 * Integration WITHOUT wagmi: the core SDK's EIP-1193 provider directly. Uses the
 * POPUP transport. Post-connect action: read the smart account's wallet
 * capabilities (EIP-5792 `wallet_getCapabilities`) — gasless/paymaster, atomic
 * batching, permissions, etc., per chain.
 */
const sdk = JAW.create({
  apiKey: import.meta.env.VITE_JAW_API_KEY ?? '',
  appName: 'JAW Example — Core (popup)',
  defaultChainId: 84532, // Base Sepolia
  preference: {
    ...(import.meta.env.VITE_KEYS_URL ? { keysUrl: import.meta.env.VITE_KEYS_URL } : {}),
    showTestnets: true,
    transportMode: 'popup',
  },
});

export function App() {
  const [address, setAddress] = useState<string>();
  const [capabilities, setCapabilities] = useState<unknown>();
  const [error, setError] = useState<string>();

  const connect = async () => {
    setError(undefined);
    try {
      const accounts = (await sdk.provider.request({ method: 'eth_requestAccounts' })) as readonly `0x${string}`[];
      setAddress(accounts[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const getCapabilities = async () => {
    if (!address) return;
    setError(undefined);
    setCapabilities(undefined);
    try {
      const result = await sdk.provider.request({
        method: 'wallet_getCapabilities',
        params: [address as `0x${string}`],
      });
      setCapabilities(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — Core SDK (no wagmi)</h1>
      <p style={{ color: '#666' }}>EIP-1193 provider directly · popup transport</p>

      {!address ? (
        <button onClick={connect}>Connect with JAW</button>
      ) : (
        <>
          <p>
            Connected: <code>{address}</code>
          </p>
          <button onClick={getCapabilities}>Get wallet capabilities</button>
        </>
      )}

      {capabilities !== undefined && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: '#f4f4f5',
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {JSON.stringify(capabilities, null, 2)}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
