import { useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { createSiweMessage, generateSiweNonce } from 'viem/siwe';

/**
 * Post-connect action: Sign-In with Ethereum (EIP-4361). After connecting, the
 * app builds a SIWE message and asks the user to sign it — establishing an
 * authenticated session. The keys dialog (here a POPUP) shows its SIWE screen.
 */
export function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [result, setResult] = useState<{ message: string; signature: string }>();
  const [error, setError] = useState<string>();

  const jawConnector = connectors.find((c) => c.id === 'jaw');

  const signIn = async () => {
    if (!address) return;
    setError(undefined);
    setResult(undefined);
    try {
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to the JAW example.',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce: generateSiweNonce(),
      });
      const signature = await signMessageAsync({ message });
      setResult({ message, signature });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — Sign-In with Ethereum</h1>
      <p style={{ color: '#666' }}>wagmi connector · popup transport (opt-out from the iframe)</p>

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
          <button onClick={signIn}>Sign in (SIWE)</button> <button onClick={() => disconnect()}>Disconnect</button>
        </>
      )}

      {result && (
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
          ✅ Signed in.{'\n\n'}— message —{'\n'}
          {result.message}
          {'\n\n'}— signature —{'\n'}
          {result.signature}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
