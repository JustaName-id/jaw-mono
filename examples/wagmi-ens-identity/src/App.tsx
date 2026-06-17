import { useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect } from 'wagmi';

// JustaName subnames are off-chain, so resolve them via the JustaName reverse
// endpoint (not a plain on-chain ENS lookup). Needs an RPC URL for the chain.
const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://sepolia.base.org';

async function reverseResolveEnsName(address: string, chainId: number, rpcUrl: string): Promise<string | null> {
  const coinType = chainId === 1 ? 60 : 2147483648 + chainId; // ENSIP-11
  const url = `https://api.justaname.id/ens/v2/reverse?rpcUrl=${encodeURIComponent(rpcUrl)}&address=${encodeURIComponent(
    address
  )}&coinType=${coinType}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { data?: { name?: string | null } | null } };
    return body.result?.data?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Post-connect action: resolve and show the connected account's ENS subname (the
 * JustaName identity layer). Integration: wagmi connector, default iframe transport.
 */
export function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  const [name, setName] = useState<string | null>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const jawConnector = connectors.find((c) => c.id === 'jaw');

  const lookup = async () => {
    if (!address) return;
    setError(undefined);
    setName(undefined);
    setLoading(true);
    try {
      setName(await reverseResolveEnsName(address, chainId, RPC_URL));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>JAW — ENS identity</h1>
      <p style={{ color: '#666' }}>wagmi connector · embedded iframe · JustaName subname</p>

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
          <button disabled={loading} onClick={lookup}>
            {loading ? 'Resolving…' : 'Resolve my ENS name'}
          </button>{' '}
          <button onClick={() => disconnect()}>Disconnect</button>
        </>
      )}

      {name !== undefined && (
        <p style={{ marginTop: 16, fontSize: 18 }}>
          {name ? (
            <>
              🪪 <strong>{name}</strong>
            </>
          ) : (
            <span style={{ color: '#666' }}>No ENS subname found for this address.</span>
          )}
        </p>
      )}
      {error && <p style={{ color: 'crimson' }}>⚠️ {error}</p>}
    </main>
  );
}
