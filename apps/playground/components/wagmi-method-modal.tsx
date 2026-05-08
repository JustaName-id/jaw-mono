'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { type WagmiMethod, CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/wagmi-methods';
import { ParameterField } from './parameter-field';
import { isLikelyEnsName, resolveEnsToAddress, resolveEnsToAddresses } from '../lib/ens-resolver';

// Helper to serialize results that may contain BigInt values
function serializeResult(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

interface WagmiMethodModalProps {
  method: WagmiMethod | null;
  isOpen: boolean;
  onClose: () => void;
  onExecute: (method: WagmiMethod, params: Record<string, unknown>) => Promise<unknown>;
  context: { address?: string; chainId?: number };
  isConnected: boolean;
  isExecuting?: boolean;
}

export function WagmiMethodModal({
  method,
  isOpen,
  onClose,
  onExecute,
  context,
  isConnected,
  isExecuting: externalIsExecuting,
}: WagmiMethodModalProps) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resultCopied, setResultCopied] = useState(false);

  // Initialize params with default values when method changes
  useEffect(() => {
    if (method?.parameters) {
      const defaults: Record<string, string> = {};
      method.parameters.forEach((param) => {
        if (param.defaultValue) {
          defaults[param.name] = param.defaultValue;
        }
      });
      setParams(defaults);
    }
  }, [method]);

  const handleParamChange = useCallback((name: string, value: string) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  }, []);

  const determineTargetChainId = (): number => {
    // Wagmi address-bearing methods don't expose a chainId param;
    // fall back to context.chainId, then mainnet.
    if (typeof context.chainId === 'number') return context.chainId;
    return 1;
  };

  const resolveParamsForExecution = async (): Promise<Record<string, string>> => {
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? '';
    const targetChainId = determineTargetChainId();
    const next: Record<string, string> = { ...params };

    for (const param of method?.parameters ?? []) {
      if (param.type !== 'address') continue;
      const value = next[param.name];
      if (!value || !isLikelyEnsName(value)) continue;
      next[param.name] = await resolveEnsToAddress(value, targetChainId, rpcUrl);
    }

    if (method?.id === 'wallet_sendCalls' && next.calls) {
      const calls = JSON.parse(next.calls) as Array<{ to?: string; [k: string]: unknown }>;
      const ensIndices: number[] = [];
      const ensNames: string[] = [];
      calls.forEach((call, i) => {
        if (typeof call.to === 'string' && isLikelyEnsName(call.to)) {
          ensIndices.push(i);
          ensNames.push(call.to);
        }
      });

      if (ensNames.length > 0) {
        const resolved = await resolveEnsToAddresses(ensNames, targetChainId, rpcUrl);
        ensIndices.forEach((idx, i) => {
          calls[idx].to = resolved[i];
        });
      }
      next.calls = JSON.stringify(calls, null, 2);
    }

    return next;
  };

  const handleExecute = async () => {
    if (!method) return;

    setError(null);
    setResult(null);
    setIsResolving(true);

    let resolvedParams: Record<string, string>;
    try {
      resolvedParams = await resolveParamsForExecution();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
      setError(errorMessage);
      setIsResolving(false);
      return;
    }
    setIsResolving(false);

    setIsExecuting(true);
    try {
      const builtParams = method.buildParams(resolvedParams, context);
      const response = await onExecute(method, builtParams);
      setResult(response);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? (err as { message: string }).message
            : JSON.stringify(err);
      setError(errorMessage);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyCode = async () => {
    if (!method) return;
    const code = method.getCodeSnippet(params);
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyResult = async () => {
    let text: string;
    if (error) {
      text = error;
    } else if (typeof result === 'string') {
      text = result;
    } else {
      text = serializeResult(result);
    }
    await navigator.clipboard.writeText(text);
    setResultCopied(true);
    setTimeout(() => setResultCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setParams({});
      setResult(null);
      setError(null);
      setIsResolving(false);
      onClose();
    }
  };

  if (!method) return null;

  const canExecute = !method.requiresConnection || isConnected;
  const codeSnippet = method.getCodeSnippet(params);
  const executing = isExecuting || externalIsExecuting;

  // Filter parameters by showWhen
  const filteredParameters = method.parameters?.filter((param) => {
    if (param.showWhen) {
      const currentValue =
        params[param.showWhen.param] ??
        method.parameters?.find((p) => p.name === param.showWhen!.param)?.defaultValue ??
        '';
      return currentValue === param.showWhen.value;
    }
    return true;
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="font-mono">{method.name}</DialogTitle>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[method.category]}`}>
              {CATEGORY_LABELS[method.category]}
            </span>
          </div>
          <DialogDescription>{method.description}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="execute" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-fit">
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="code">Code Snippet</TabsTrigger>
          </TabsList>

          <TabsContent value="execute" className="mt-4 min-h-0 flex-1">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4 pb-4">
                {/* Parameters */}
                {method.parameters && method.parameters.length > 0 ? (
                  <div className="space-y-4">
                    {filteredParameters?.map((param) => (
                      <ParameterField
                        key={param.name}
                        param={param}
                        value={params[param.name] || ''}
                        onChange={(value) => handleParamChange(param.name, value)}
                        context={{ address: context.address, chainId: context.chainId?.toString() }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">This method has no parameters.</p>
                )}

                {/* Execute Button */}
                <div className="pt-2">
                  <Button onClick={handleExecute} disabled={!canExecute || executing || isResolving} className="w-full">
                    {isResolving ? 'Resolving...' : executing ? 'Executing...' : 'Execute'}
                  </Button>
                  {!canExecute && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      Connect your wallet first to execute this method.
                    </p>
                  )}
                </div>

                {/* Result */}
                {(result !== null || error) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">{error ? 'Error' : 'Result'}</h4>
                      <Button variant="outline" size="sm" onClick={handleCopyResult}>
                        {resultCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre
                      className={`max-h-[200px] overflow-auto whitespace-pre-wrap break-all rounded-md p-3 font-mono text-xs ${
                        error ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
                      }`}
                    >
                      {error || serializeResult(result)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="code" className="mt-4 min-h-0 flex-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Code Example</h4>
                <Button variant="outline" size="sm" onClick={handleCopyCode}>
                  {copied ? 'Copied!' : 'Copy'}
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
