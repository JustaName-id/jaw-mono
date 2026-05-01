'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { ScrollArea } from './ui/scroll-area';
import { type RpcMethod, CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/rpc-methods';
import { ParameterField } from './parameter-field';

interface MethodModalProps {
  method: RpcMethod | null;
  isOpen: boolean;
  onClose: () => void;
  onExecute: (method: string, params: unknown[]) => Promise<unknown>;
  context: { address?: string; chainId?: string };
  isConnected: boolean;
}

export function MethodModal({ method, isOpen, onClose, onExecute, context, isConnected }: MethodModalProps) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
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

  const handleExecute = async () => {
    if (!method) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const builtParams = method.buildParams(params, context);
      const response = await onExecute(method.method, builtParams);
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
      text = JSON.stringify(result, null, 2);
    }
    await navigator.clipboard.writeText(text);
    setResultCopied(true);
    setTimeout(() => setResultCopied(false), 2000);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setParams({});
      setResult(null);
      setError(null);
      onClose();
    }
  };

  if (!method) return null;

  const canExecute = !method.requiresConnection || isConnected;
  const codeSnippet = method.getCodeSnippet(params);

  // Filter parameters: generic showWhen + method-specific wallet_sign logic
  const filteredParameters = method.parameters?.filter((param) => {
    // Generic showWhen: only show when another param has a specific value
    if (param.showWhen) {
      const currentValue =
        params[param.showWhen.param] ??
        method.parameters?.find((p) => p.name === param.showWhen!.param)?.defaultValue ??
        '';
      return currentValue === param.showWhen.value;
    }
    // For wallet_sign, show message field only for 0x45, and typedData field only for 0x01
    if (method.id === 'wallet_sign') {
      const selectedType = params.type || '0x45';
      if (param.name === 'message' && selectedType !== '0x45') return false;
      if (param.name === 'typedData' && selectedType !== '0x01') return false;
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
                {filteredParameters && filteredParameters.length > 0 ? (
                  <div className="space-y-4">
                    {filteredParameters.map((param) => (
                      <ParameterField
                        key={param.name}
                        param={param}
                        value={params[param.name] || ''}
                        onChange={(value) => handleParamChange(param.name, value)}
                        context={context}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">This method has no parameters.</p>
                )}

                {/* Execute Button */}
                <div className="pt-2">
                  <Button onClick={handleExecute} disabled={!canExecute || isExecuting} className="w-full">
                    {isExecuting ? 'Executing...' : 'Execute'}
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
                      className={`max-h-[200px] overflow-auto rounded-md p-3 font-mono text-xs ${
                        error ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
                      }`}
                    >
                      {error || JSON.stringify(result, null, 2)}
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
