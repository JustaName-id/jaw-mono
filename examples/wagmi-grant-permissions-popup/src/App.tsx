import { useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useGrantPermissions } from '@jaw.id/wagmi';

// The entity that may USE the granted permission — e.g. an agent or a session
// key your backend holds. Replace with your own. (Example placeholder.)
const SPENDER = '0x000000000000000000000000000000000000dEaD' as const;
// Base Sepolia USDC (example fee/spend token).
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

/**
 * Post-connect action: grant a scoped ERC-7715 permission. After connecting, the
 * user authorizes a spender to spend up to a capped amount per period and call a
 * specific function — the consent screen shows the limits. This is the building
 * block for agents / sessions that act within a bounded budget.
 */
export function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { mutateAsync: grantPermissions, isPending: isGranting } = useGrantPermissions();

  const [result, setResult] = useState<unknown>();
  const [error, setError] = useState<string>();

  const jawConnector = connectors.find((c) => c.id === 'jaw');

  const grant = async () => {
    setError(undefined);
    setResult(undefined);
    try {
      const granted = await grantPermissions({
        spender: SPENDER,
        expiry: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days (unix seconds)
        permissions: {
          spends: [{ token: USDC, allowance: '1000000', unit: 'day', multiplier: 1 }], // 1 USDC/day
          calls: [{ target: USDC, functionSignature: 'transfer(address,uint256)' }],
        },
      });
      setResult(granted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — Grant a scoped permission</h1>
      <p style={{ color: '#666' }}>wagmi connector · popup transport · ERC-7715</p>

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
          <button disabled={isGranting} onClick={grant}>
            {isGranting ? 'Granting…' : 'Grant 1 USDC/day to spender'}
          </button>{' '}
          <button onClick={() => disconnect()}>Disconnect</button>
        </>
      )}

      {result !== undefined && (
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
          ✅ Permission granted.{'\n'}
          {JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}
        </pre>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
