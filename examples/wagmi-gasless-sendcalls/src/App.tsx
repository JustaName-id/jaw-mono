import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSendCalls } from 'wagmi';

/**
 * Post-connect action: send a batched, gasless EIP-5792 `wallet_sendCalls`. The
 * paymaster (configured in config.ts) sponsors gas, so no native ETH is needed.
 * Here the batch is a single no-op self-call; add real calls (approve + swap, …).
 */
export function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendCallsAsync } = useSendCalls();

  const [batchId, setBatchId] = useState<string>();
  const [error, setError] = useState<string>();

  const jawConnector = connectors.find((c) => c.id === 'jaw');

  const sendGasless = async () => {
    if (!address) return;
    setError(undefined);
    setBatchId(undefined);
    try {
      const { id } = await sendCallsAsync({ calls: [{ to: address, value: 0n }] });
      setBatchId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — Gasless batched calls</h1>
      <p style={{ color: '#666' }}>wagmi connector · embedded iframe · ERC-20 paymaster (EIP-5792)</p>

      {!isConnected ? (
        <button
          disabled={isPending || !jawConnector}
          onClick={() => jawConnector && connect({ connector: jawConnector })}
        >
          {isPending ? 'Connecting…' : 'Connect with JAW'}
        </button>
      ) : (
        <>
          <p>
            Connected: <code>{address}</code>
          </p>
          <button onClick={sendGasless}>Send gasless batch</button>{' '}
          <button onClick={() => disconnect()}>Disconnect</button>
        </>
      )}

      {batchId && (
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
          ✅ Batch submitted (gasless).{'\n'}id: {batchId}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
