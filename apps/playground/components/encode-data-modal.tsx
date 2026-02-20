'use client';

import { useState, useCallback } from 'react';
import { encodeFunctionData, parseAbiItem } from 'viem';
import type { AbiFunction, AbiParameter } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../lib/rpc-methods';

function parseArgValue(value: string, type: string): unknown {
  const trimmed = value.trim();
  if (type === 'address') return trimmed as `0x${string}`;
  if (type === 'bool') return trimmed === 'true';
  if (type === 'string') return trimmed;
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(trimmed);
  if (type.startsWith('bytes')) return trimmed as `0x${string}`;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function getPlaceholder(type: string): string {
  if (type === 'address') return '0x...';
  if (type === 'bool') return 'true or false';
  if (type.startsWith('uint') || type.startsWith('int')) return '0';
  if (type.startsWith('bytes')) return '0x...';
  if (type === 'string') return 'hello world';
  if (type.endsWith(']') || type.includes('(')) return 'JSON value';
  return type;
}

const CODE_SNIPPET = `import { encodeFunctionData, parseAbiItem } from 'viem';

const abiItem = parseAbiItem('function transfer(address to, uint256 amount)');

const data = encodeFunctionData({
  abi: [abiItem],
  functionName: 'transfer',
  args: [
    '0xRecipient...',
    1000000000000000000n, // 1 ETH in wei
  ],
});

console.log(data); // 0xa9059cbb...`;

interface EncodeDataModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EncodeDataModal({ isOpen, onClose }: EncodeDataModalProps) {
  const [signature, setSignature] = useState('');
  const [parsedFn, setParsedFn] = useState<AbiFunction | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [paramValues, setParamValues] = useState<string[]>([]);
  const [encodedData, setEncodedData] = useState<string | null>(null);
  const [encodeError, setEncodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const reset = () => {
    setSignature('');
    setParsedFn(null);
    setParseError(null);
    setParamValues([]);
    setEncodedData(null);
    setEncodeError(null);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
      onClose();
    }
  };

  const handleParse = useCallback((sig: string) => {
    setParseError(null);
    setParsedFn(null);
    setParamValues([]);
    setEncodedData(null);
    setEncodeError(null);

    const raw = sig.trim();
    if (!raw) return;

    try {
      const full = raw.startsWith('function ') ? raw : `function ${raw}`;
      const item = parseAbiItem(full);
      if (item.type !== 'function') {
        setParseError('Input must be a function signature');
        return;
      }
      setParsedFn(item as AbiFunction);
      setParamValues(new Array(item.inputs.length).fill(''));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid function signature');
    }
  }, []);

  const handleSignatureChange = (value: string) => {
    setSignature(value);
    // Reset parsed state when signature changes
    if (parsedFn) {
      setParsedFn(null);
      setParamValues([]);
      setEncodedData(null);
      setEncodeError(null);
    }
  };

  const handleParamChange = (index: number, value: string) => {
    setParamValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setEncodedData(null);
    setEncodeError(null);
  };

  const handleEncode = useCallback(() => {
    if (!parsedFn) return;
    setEncodeError(null);
    setEncodedData(null);

    try {
      const args = parsedFn.inputs.map((input: AbiParameter, i: number) =>
        parseArgValue(paramValues[i] ?? '', input.type)
      );

      const encoded = encodeFunctionData({
        abi: [parsedFn],
        functionName: parsedFn.name,
        args,
      });

      setEncodedData(encoded);
    } catch (err) {
      setEncodeError(err instanceof Error ? err.message : 'Encoding failed');
    }
  }, [parsedFn, paramValues]);

  const handleCopyResult = async () => {
    if (!encodedData && !encodeError) return;
    await navigator.clipboard.writeText(encodedData ?? encodeError ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(CODE_SNIPPET);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle className="font-mono">encodeFunctionData</DialogTitle>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${CATEGORY_COLORS['utility']}`}
            >
              {CATEGORY_LABELS['utility']}
            </span>
          </div>
          <DialogDescription>
            Generate ABI-encoded calldata from a Solidity function signature and its arguments.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="execute" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-fit">
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="code">Code Snippet</TabsTrigger>
          </TabsList>

          {/* Execute Tab */}
          <TabsContent value="execute" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4 pb-4">

                {/* Function Signature */}
                <div className="space-y-2">
                  <Label htmlFor="fn-sig">Function Signature</Label>
                  <div className="flex gap-2">
                    <Input
                      id="fn-sig"
                      value={signature}
                      onChange={(e) => handleSignatureChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleParse(signature)}
                      placeholder="transfer(address to, uint256 amount)"
                      className="font-mono flex-1"
                    />
                    <Button variant="outline" onClick={() => handleParse(signature)}>
                      Parse
                    </Button>
                  </div>
                  {parseError && (
                    <p className="text-xs text-destructive">{parseError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Examples:{' '}
                    <code className="bg-muted px-1 rounded text-xs">transfer(address,uint256)</code>
                    {' · '}
                    <code className="bg-muted px-1 rounded text-xs">approve(address,uint256)</code>
                    {' · '}
                    <code className="bg-muted px-1 rounded text-xs">balanceOf(address)</code>
                  </p>
                </div>

                {/* Parameter Fields */}
                {parsedFn && parsedFn.inputs.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">Parameters</h4>
                    {parsedFn.inputs.map((input: AbiParameter, i: number) => (
                      <div key={i} className="space-y-1">
                        <Label htmlFor={`enc-param-${i}`} className="font-mono text-xs">
                          {input.name ? input.name : `arg${i}`}{' '}
                          <span className="text-muted-foreground">({input.type})</span>
                        </Label>
                        <Input
                          id={`enc-param-${i}`}
                          value={paramValues[i] ?? ''}
                          onChange={(e) => handleParamChange(i, e.target.value)}
                          placeholder={getPlaceholder(input.type)}
                          className={
                            input.type === 'address' || input.type.startsWith('bytes')
                              ? 'font-mono'
                              : ''
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                {parsedFn && parsedFn.inputs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No parameters — this function takes no arguments.
                  </p>
                )}

                {/* Encode Button */}
                {parsedFn && (
                  <div className="pt-2">
                    <Button onClick={handleEncode} className="w-full">
                      Encode Data
                    </Button>
                  </div>
                )}

                {/* Result */}
                {(encodedData !== null || encodeError) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">
                        {encodeError ? 'Error' : 'Encoded Calldata'}
                      </h4>
                      <Button variant="outline" size="sm" onClick={handleCopyResult}>
                        {copied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <pre
                      className={`p-3 rounded-md text-xs font-mono overflow-auto max-h-[160px] break-all whitespace-pre-wrap ${
                        encodeError
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-foreground'
                      }`}
                    >
                      {encodeError ?? encodedData}
                    </pre>
                    {!encodeError && (
                      <p className="text-xs text-muted-foreground">
                        First 4 bytes = function selector · remaining = ABI-encoded arguments
                      </p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Code Snippet Tab */}
          <TabsContent value="code" className="flex-1 min-h-0 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Code Example</h4>
                <Button variant="outline" size="sm" onClick={handleCopyCode}>
                  {codeCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <ScrollArea className="h-[400px]">
                <pre className="p-4 rounded-md bg-muted text-xs font-mono overflow-auto">
                  {CODE_SNIPPET}
                </pre>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
