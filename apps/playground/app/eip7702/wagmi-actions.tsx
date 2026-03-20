'use client';

import { useState } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance, useSignMessage, useSendTransaction } from 'wagmi';
import { parseEther, type Address } from 'viem';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { readContract } from 'viem/actions';
import { isDelegatedToImplementation } from '@jaw.id/core';

const RECIPIENT = '0xb965a5f3a0fC18D84E68883ccAd508445a7917A8';
const BASE_SEPOLIA_RPC = 'https://base-sepolia.g.alchemy.com/v2/zUS3t7NekYC73r0oUDHax6WxE7GNsPDJ';
const FACTORY_ADDRESS = '0x5803c076563C85799989d42Fc00292A8aE52fa9E';
const FACTORY_ABI = [
    {
        type: 'function',
        name: 'getImplementation',
        inputs: [],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
    },
] as const;

type LogEntry = {
    time: string;
    message: string;
    type: 'info' | 'success' | 'error';
};

export function WagmiActions() {
    const { address, isConnected, connector } = useAccount();
    const { connect, connectors } = useConnect();
    const { disconnect } = useDisconnect();
    const balance = useBalance({ address });
    const { signMessage } = useSignMessage();
    const { sendTransaction } = useSendTransaction();

    const [log, setLog] = useState<LogEntry[]>([]);
    const [delegationStatus, setDelegationStatus] = useState<boolean | null>(null);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLog((prev) => [...prev, { time, message, type }]);
    };

    const handleConnect = async () => {
        try {
            const jawConnector = connectors[0];
            if (!jawConnector) {
                addLog('No JAW connector available — localAccount not set?', 'error');
                return;
            }
            addLog('Connecting via JAW connector...');
            connect({ connector: jawConnector });
        } catch (err) {
            addLog(`Connect failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const handleSendTransaction = async () => {
        if (!address) return;
        addLog(`Sending 0.0001 ETH to ${RECIPIENT.slice(0, 10)}...`);
        try {
            sendTransaction({
                to: RECIPIENT as Address,
                value: parseEther('0.0001'),
            }, {
                onSuccess: (hash: string) => {
                    addLog(`sendTransaction succeeded: ${hash}`, 'success');
                },
                onError: (err: Error) => {
                    addLog(`sendTransaction failed: ${err.message}`, 'error');
                },
            });
        } catch (err) {
            addLog(`sendTransaction error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const handleSignMessage = async () => {
        addLog('Signing message: "Hello EIP-7702"...');
        try {
            signMessage({ message: 'Hello EIP-7702' }, {
                onSuccess: (sig: string) => {
                    addLog(`Signature: ${sig.slice(0, 30)}...`, 'success');
                },
                onError: (err: Error) => {
                    addLog(`Sign failed: ${err.message}`, 'error');
                },
            });
        } catch (err) {
            addLog(`Sign error: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const handleCheckDelegation = async () => {
        if (!address) return;
        addLog('Checking delegation status...');
        try {
            const publicClient = createPublicClient({
                chain: baseSepolia,
                transport: http(BASE_SEPOLIA_RPC),
            });

            const impl = await readContract(publicClient, {
                address: FACTORY_ADDRESS as Address,
                abi: FACTORY_ABI,
                functionName: 'getImplementation',
            });

            const delegated = await isDelegatedToImplementation(publicClient, address, impl);
            setDelegationStatus(delegated);
            addLog(`Delegated to our implementation: ${delegated}`, delegated ? 'success' : 'info');
        } catch (err) {
            addLog(`Delegation check failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    return (
        <div className="space-y-4">
            {/* Account info */}
            <div className="p-4 border rounded-lg">
                <h2 className="text-lg font-semibold mb-3">Account</h2>
                {isConnected && address ? (
                    <div className="space-y-1 text-sm">
                        <div>
                            Address: <code className="text-xs">{address}</code>
                        </div>
                        <div>
                            Balance: {balance.data ? `${(Number(balance.data.value) / 1e18).toFixed(6)} ETH` : 'Loading...'}
                        </div>
                        <div>
                            Delegation: {delegationStatus === null ? 'Not checked' : delegationStatus ? 'Active' : 'Not delegated'}
                        </div>
                        <div>
                            Connector: {connector?.name}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Not connected</p>
                )}
            </div>

            {/* Actions */}
            <div className="p-4 border rounded-lg">
                <h2 className="text-lg font-semibold mb-3">Actions</h2>
                <div className="flex flex-wrap gap-2">
                    {!isConnected ? (
                        <button
                            onClick={handleConnect}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90"
                        >
                            Connect
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={handleSendTransaction}
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90"
                            >
                                Send 0.0001 ETH
                            </button>
                            <button
                                onClick={handleSignMessage}
                                className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90"
                            >
                                Sign Message
                            </button>
                            <button
                                onClick={handleCheckDelegation}
                                className="px-3 py-1.5 bg-muted text-muted-foreground rounded font-medium text-sm hover:bg-muted/80"
                            >
                                Check Delegation
                            </button>
                            <button
                                onClick={() => disconnect()}
                                className="px-3 py-1.5 bg-muted text-muted-foreground rounded font-medium text-sm hover:bg-muted/80"
                            >
                                Disconnect
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Log */}
            <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Log</h2>
                    <button
                        onClick={() => setLog([])}
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Clear
                    </button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
                    {log.length === 0 ? (
                        <p className="text-muted-foreground">No actions yet</p>
                    ) : (
                        log.map((entry, i) => (
                            <div
                                key={i}
                                className={
                                    entry.type === 'error'
                                        ? 'text-red-500'
                                        : entry.type === 'success'
                                        ? 'text-green-500'
                                        : 'text-muted-foreground'
                                }
                            >
                                <span className="opacity-50">[{entry.time}]</span> {entry.message}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
