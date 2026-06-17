import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';

/**
 * Post-connect action: sign a personal message (EIP-191) and show the signature.
 * Integration: wagmi connector, default (embedded iframe) transport.
 */
export function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [signature, setSignature] = useState<string>();
  const [error, setError] = useState<string>();

  const jawConnector = connectors.find((c) => c.id === 'jaw');

  const signAfterConnect = async () => {
    setError(undefined);
    setSignature(undefined);
    try {
      const sig = await signMessageAsync({ message: 'Hello from JAW 👋' });
      setSignature(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — Sign a message</h1>
      <p style={{ color: '#666' }}>wagmi connector · embedded iframe transport (default)</p>

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
          <button onClick={signAfterConnect}>Sign a message</button>{' '}
          <button onClick={() => disconnect()}>Disconnect</button>
        </>
      )}

      {signature && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: '#f4f4f5',
            borderRadius: 8,
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          ✅ Signature:{'\n'}
          {signature}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
