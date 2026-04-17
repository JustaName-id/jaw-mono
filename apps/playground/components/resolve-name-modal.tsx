'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/rpc-methods';

const CHAIN_OPTIONS = [
  { label: 'Ethereum (eip155:1)', value: 'ethereum' },
  { label: 'Optimism (eip155:10)', value: 'optimism' },
  { label: 'Base (eip155:8453)', value: 'base' },
  { label: 'Arbitrum (eip155:42161)', value: 'arbitrum' },
  { label: 'Polygon (eip155:137)', value: 'eip155:137' },
];

const DEFAULT_RPC = 'https://eth.drpc.org';

interface ResolvedAddress {
  id: number;
  name: string;
  value: string;
}

interface ResolveResponse {
  statusCode: number;
  result: {
    data: {
      ens: string;
      isJAN: boolean;
      records: {
        resolverAddress: string;
        texts: { key: string; value: string }[];
        coins?: ResolvedAddress[];
        addresses?: ResolvedAddress[];
        contentHash: unknown;
      };
    } | null;
    error: string | null;
  };
}

interface ResolveNameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ResolveNameModal({ isOpen, onClose }: ResolveNameModalProps) {
  const [ensName, setEnsName] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [providerUrl, setProviderUrl] = useState(DEFAULT_RPC);
  const [result, setResult] = useState<ResolveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const interopName = ensName && chain ? `${ensName}@${chain}` : '';

  const codeSnippet = `// Resolve ${ensName || 'NAME'}@${chain || 'CHAIN'} using the JustaName records endpoint
const response = await fetch(
  \`https://api.justaname.id/ens/v1/subname/records?ens=${encodeURIComponent(interopName || 'name@chain')}&providerUrl=${encodeURIComponent(providerUrl)}\`
);
const { result } = await response.json();

// Extract the address for the target chain
const address = result.data?.records?.addresses[0]?.value;
console.log(address);`;

  const reset = () => {
    setEnsName('');
    setChain('ethereum');
    setProviderUrl(DEFAULT_RPC);
    setResult(null);
    setError(null);
    setIsLoading(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
      onClose();
    }
  };

  const handleResolve = useCallback(async () => {
    if (!ensName || !chain || !providerUrl) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = `https://api.justaname.id/ens/v1/subname/records?ens=${encodeURIComponent(
        `${ensName}@${chain}`
      )}&providerUrl=${encodeURIComponent(providerUrl)}`;

      const response = await fetch(url);
      const data: ResolveResponse = await response.json();

      if (!response.ok || data.result?.error) {
        setError(data.result?.error || `HTTP ${response.status}`);
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsLoading(false);
    }
  }, [ensName, chain, providerUrl]);

  const recordsArray = result?.result?.data?.records?.coins ?? result?.result?.data?.records?.addresses;
  const resolvedAddress = recordsArray?.[0]?.value;
  const resolvedRecord = recordsArray?.[0];

  const handleCopyAddress = async () => {
    if (!resolvedAddress) return;
    await navigator.clipboard.writeText(resolvedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(codeSnippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="font-mono">resolveName</DialogTitle>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS['utility']}`}>
              {CATEGORY_LABELS['utility']}
            </span>
          </div>
          <DialogDescription>
            Resolve an ENS name to an address on a specific chain using ERC-7828 interoperable name format.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="execute" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="code">Code Snippet</TabsTrigger>
          </TabsList>

          <TabsContent value="execute" className="mt-4 min-h-0 flex-1">
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4 pb-4">
                <div className="space-y-2">
                  <Label htmlFor="ens-name">ENS Name</Label>
                  <Input
                    id="ens-name"
                    value={ensName}
                    onChange={(e) => setEnsName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleResolve()}
                    placeholder="vitalik.eth"
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="chain-select">Chain</Label>
                  <Select value={chain} onValueChange={setChain}>
                    <SelectTrigger id="chain-select">
                      <SelectValue placeholder="Select a chain" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHAIN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider-url">Provider URL</Label>
                  <Input
                    id="provider-url"
                    value={providerUrl}
                    onChange={(e) => setProviderUrl(e.target.value)}
                    placeholder="https://eth.drpc.org"
                    className="font-mono"
                  />
                  <p className="text-muted-foreground text-xs">
                    RPC endpoint used to resolve ENS records. Defaults to a public mainnet RPC.
                  </p>
                </div>

                {interopName && (
                  <div className="bg-muted space-y-1 rounded-md p-3">
                    <p className="text-muted-foreground text-xs font-medium">Interop name</p>
                    <p className="break-all font-mono text-sm">{interopName}</p>
                  </div>
                )}

                <Button onClick={handleResolve} disabled={!ensName || !chain || isLoading} className="w-full">
                  {isLoading ? 'Resolving...' : 'Resolve'}
                </Button>

                {error && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Error</h4>
                    <pre className="bg-destructive/10 text-destructive whitespace-pre-wrap break-all rounded-md p-3 font-mono text-xs">
                      {error}
                    </pre>
                  </div>
                )}

                {resolvedAddress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">Resolved Address</h4>
                      <Button variant="outline" size="sm" onClick={handleCopyAddress}>
                        {copied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre className="bg-muted break-all rounded-md p-3 font-mono text-sm">{resolvedAddress}</pre>
                    {resolvedRecord && (
                      <p className="text-muted-foreground text-xs">
                        coinType {resolvedRecord.id} ({resolvedRecord.name})
                      </p>
                    )}
                  </div>
                )}

                {result && !resolvedAddress && !error && (
                  <div className="bg-muted space-y-1 rounded-md p-3">
                    <p className="text-sm font-medium">Name resolved, but no address is set for this chain.</p>
                    <p className="text-muted-foreground text-xs">
                      The ENS name exists, but the owner hasn&apos;t configured an address for the selected chain.
                    </p>
                  </div>
                )}

                {result && (
                  <details className="space-y-2">
                    <summary className="cursor-pointer text-sm font-medium">Full response</summary>
                    <pre className="bg-muted max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded-md p-3 font-mono text-xs">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="code" className="mt-4 min-h-0 flex-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Code Example</h4>
                <Button variant="outline" size="sm" onClick={handleCopyCode}>
                  {codeCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <ScrollArea className="h-[400px]">
                <pre className="bg-muted overflow-auto rounded-md p-4 font-mono text-xs">{codeSnippet}</pre>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
