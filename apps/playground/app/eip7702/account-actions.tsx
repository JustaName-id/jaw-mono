'use client';

import { useState, useEffect } from 'react';
import { parseEther, createPublicClient, http, type Address, type LocalAccount } from 'viem';
import { baseSepolia } from 'viem/chains';
import { readContract } from 'viem/actions';
import { Account } from '@jaw.id/core';
import { isDelegatedToImplementation } from '@jaw.id/core';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 84532);
const RECIPIENT = '0xb965a5f3a0fC18D84E68883ccAd508445a7917A8';
const RPC_URL = 'https://base-sepolia.g.alchemy.com/v2/zUS3t7NekYC73r0oUDHax6WxE7GNsPDJ';
const FACTORY_ADDRESS = '0x5803c076563C85799989d42Fc00292A8aE52fa9E';
const FACTORY_ABI = [{
    type: 'function', name: 'getImplementation', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view',
}] as const;

type LogEntry = { time: string; message: string; type: 'info' | 'success' | 'error' };

interface AccountActionsProps {
    localAccount: LocalAccount;
}

export function AccountActions({ localAccount }: AccountActionsProps) {
    const [account, setAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState(true);
    const [delegated, setDelegated] = useState<boolean | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLog((prev) => [...prev, { time, message, type }]);
    };

    // Create the EIP-7702 account on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                addLog(`Creating EIP-7702 account for ${localAccount.address.slice(0, 10)}...`);
                const acc = await Account.fromLocalAccount(
                    { chainId: CHAIN_ID, apiKey: API_KEY },
                    localAccount,
                    { eip7702: true },
                );
                if (cancelled) return;
                setAccount(acc);
                addLog(`Account ready: ${acc.address}`, 'success');

                // Check delegation status
                const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
                const impl = await readContract(publicClient, { address: FACTORY_ADDRESS as Address, abi: FACTORY_ABI, functionName: 'getImplementation' });
                const isDelegated = await isDelegatedToImplementation(publicClient, localAccount.address, impl);
                if (cancelled) return;
                setDelegated(isDelegated);
                addLog(`Delegation status: ${isDelegated ? 'active' : 'not delegated'}`);
            } catch (err) {
                if (cancelled) return;
                addLog(`Failed to create account: ${err instanceof Error ? err.message : String(err)}`, 'error');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [localAccount]);

    const handleSendCalls = async () => {
        if (!account) return;
        addLog(`Sending 0.0001 ETH to ${RECIPIENT.slice(0, 10)}...`);
        try {
            const { id } = await account.sendCalls([
                { to: RECIPIENT, value: parseEther('0.0001') },
            ]);
            addLog(`sendCalls succeeded: ${id}`, 'success');
        } catch (err) {
            addLog(`sendCalls failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const handleSignMessage = async () => {
        if (!account) return;
        addLog('Signing message: "Hello EIP-7702"...');
        try {
            const sig = await account.signMessage('Hello EIP-7702');
            addLog(`Signature: ${sig.slice(0, 30)}...`, 'success');
        } catch (err) {
            addLog(`Sign failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    const handleCheckDelegation = async () => {
        addLog('Checking delegation status...');
        try {
            const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
            const impl = await readContract(publicClient, { address: FACTORY_ADDRESS as Address, abi: FACTORY_ABI, functionName: 'getImplementation' });
            const isDelegated = await isDelegatedToImplementation(publicClient, localAccount.address, impl);
            setDelegated(isDelegated);
            addLog(`Delegated: ${isDelegated}`, isDelegated ? 'success' : 'info');
        } catch (err) {
            addLog(`Check failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
    };

    if (loading) {
        return <div className="p-4 border rounded-lg text-muted-foreground">Creating EIP-7702 account...</div>;
    }

    return (
        <div className="space-y-4">
            {/* Account info */}
            <div className="p-4 border rounded-lg">
                <h2 className="text-lg font-semibold mb-3">Account</h2>
                <div className="space-y-1 text-sm">
                    <div>Address: <code className="text-xs">{account?.address}</code></div>
                    <div>Delegation: {delegated === null ? 'Unknown' : delegated ? 'Active' : 'Not delegated'}</div>
                </div>
            </div>

            {/* Actions */}
            <div className="p-4 border rounded-lg">
                <h2 className="text-lg font-semibold mb-3">Actions</h2>
                <div className="flex flex-wrap gap-2">
                    <button onClick={handleSendCalls} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90">
                        Send 0.0001 ETH
                    </button>
                    <button onClick={handleSignMessage} className="px-3 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90">
                        Sign Message
                    </button>
                    <button onClick={handleCheckDelegation} className="px-3 py-1.5 bg-muted text-muted-foreground rounded font-medium text-sm hover:bg-muted/80">
                        Check Delegation
                    </button>
                </div>
            </div>

            {/* Log */}
            <div className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Log</h2>
                    <button onClick={() => setLog([])} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                </div>
                <div className="space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
                    {log.length === 0 ? (
                        <p className="text-muted-foreground">No actions yet</p>
                    ) : log.map((entry, i) => (
                        <div key={i} className={entry.type === 'error' ? 'text-red-500' : entry.type === 'success' ? 'text-green-500' : 'text-muted-foreground'}>
                            <span className="opacity-50">[{entry.time}]</span> {entry.message}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
