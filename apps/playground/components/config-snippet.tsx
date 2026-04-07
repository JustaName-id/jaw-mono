'use client';

import { useState } from 'react';
import { Mode } from '@jaw.id/core';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

export type PaymasterChainConfig = {
  chainId: number;
  url: string;
  context?: Record<string, unknown>;
};

export type PaymasterApplyConfig = {
  chains: PaymasterChainConfig[];
};

type ModeType = (typeof Mode)[keyof typeof Mode];
type ConfigType = 'wagmi' | 'core';

interface ChainEntry {
  chainId: string;
  url: string;
  contextJson: string;
}

interface ConfigSnippetProps {
  type: ConfigType;
  mode: ModeType;
  paymasters?: PaymasterApplyConfig;
  onPaymasterApply?: (config: PaymasterApplyConfig | null) => void;
}

function buildPaymasterBlock(paymasters: PaymasterApplyConfig, indent: string): string {
  const chains = paymasters.chains.map((chain) => {
    let entry = `${indent}  ${chain.chainId}: {\n${indent}    url: '${chain.url}',`;
    if (chain.context) {
      const contextStr = JSON.stringify(chain.context, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : `${indent}    ${line}`))
        .join('\n');
      entry += `\n${indent}    context: ${contextStr},`;
    }
    entry += `\n${indent}  },`;
    return entry;
  });
  return `${indent}paymasters: {\n${chains.join('\n')}\n${indent}},`;
}

function getCoreCode(mode: ModeType, pm?: PaymasterApplyConfig): string {
  const pmBlock = pm ? buildPaymasterBlock(pm, '  ') : null;
  const lines: (string | null)[] = [
    mode === Mode.AppSpecific ? `import { JAW, Mode } from '@jaw.id/core';` : `import { JAW } from '@jaw.id/core';`,
    mode === Mode.AppSpecific ? `import { ReactUIHandler } from '@jaw.id/ui';` : null,
    ``,
    `const jaw = JAW.create({`,
    `  apiKey: 'YOUR_API_KEY',`,
    `  appName: 'My App',`,
    `  appLogoUrl: 'https://example.com/logo.png',`,
    `  // Optional: Issue subnames under your ENS domain`,
    `  // Needs to be configured on the JAW Dashboard`,
    `  ens: 'myapp.eth',`,
    mode === Mode.AppSpecific ? `  preference: {` : null,
    mode === Mode.AppSpecific ? `    mode: Mode.AppSpecific,` : null,
    mode === Mode.AppSpecific ? `    uiHandler: new ReactUIHandler(),` : null,
    mode === Mode.AppSpecific ? `  },` : null,
    pmBlock,
    `});`,
    ``,
    `// Use the EIP-1193 provider`,
    `const provider = jaw.provider;`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function getWagmiCode(mode: ModeType, pm?: PaymasterApplyConfig): string {
  const pmBlock = pm ? buildPaymasterBlock(pm, '      ') : null;
  const lines: (string | null)[] = [
    `import { createConfig, http } from 'wagmi';`,
    `import { mainnet, base } from 'wagmi/chains';`,
    `import { jaw } from '@jaw.id/wagmi';`,
    mode === Mode.AppSpecific ? `import { Mode } from '@jaw.id/core';` : null,
    mode === Mode.AppSpecific ? `import { ReactUIHandler } from '@jaw.id/ui';` : null,
    ``,
    `export const config = createConfig({`,
    `  chains: [mainnet, base],`,
    `  connectors: [`,
    `    jaw({`,
    `      apiKey: 'YOUR_API_KEY',`,
    `      appName: 'My App',`,
    `      appLogoUrl: 'https://example.com/logo.png',`,
    `      // Optional: Issue subnames under your ENS domain`,
    `      // Needs to be configured on the JAW Dashboard`,
    `      ens: 'myapp.eth',`,
    mode === Mode.AppSpecific ? `      preference: {` : null,
    mode === Mode.AppSpecific ? `        mode: Mode.AppSpecific,` : null,
    mode === Mode.AppSpecific ? `        uiHandler: new ReactUIHandler(),` : null,
    mode === Mode.AppSpecific ? `      },` : null,
    pmBlock,
    `    }),`,
    `  ],`,
    `  transports: {`,
    `    [mainnet.id]: http(),`,
    `    [base.id]: http(),`,
    `  },`,
    `});`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

export function ConfigSnippet({ type, mode, paymasters, onPaymasterApply }: ConfigSnippetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [entries, setEntries] = useState<ChainEntry[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const code = type === 'wagmi' ? getWagmiCode(mode, paymasters) : getCoreCode(mode, paymasters);
  const modeName = mode === Mode.AppSpecific ? 'App-Specific' : 'Cross-Platform';
  const fileName = type === 'wagmi' ? 'config.ts' : 'setup.ts';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openForm = (editing = false) => {
    setFormErrors([]);
    if (editing && paymasters) {
      setEntries(
        paymasters.chains.map((c) => ({
          chainId: String(c.chainId),
          url: c.url,
          contextJson: c.context ? JSON.stringify(c.context, null, 2) : '',
        }))
      );
    } else {
      setEntries([{ chainId: '84532', url: '', contextJson: '' }]);
    }
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormErrors([]);
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, { chainId: '', url: '', contextJson: '' }]);
  };

  const removeEntry = (i: number) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateEntry = (i: number, field: keyof ChainEntry, value: string) => {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
    setFormErrors([]);
  };

  const handleApply = () => {
    const errors: string[] = [];
    const chains: PaymasterChainConfig[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const prefix = entries.length > 1 ? `Chain ${i + 1}: ` : '';

      if (!entry.chainId.trim() || isNaN(parseInt(entry.chainId))) {
        errors.push(`${prefix}Chain ID is required and must be a number.`);
        continue;
      }
      if (!entry.url.trim()) {
        errors.push(`${prefix}Paymaster URL is required.`);
        continue;
      }

      let context: Record<string, unknown> | undefined;
      if (entry.contextJson.trim()) {
        try {
          context = JSON.parse(entry.contextJson);
        } catch {
          errors.push(`${prefix}Context JSON is invalid.`);
          continue;
        }
      }
      chains.push({ chainId: parseInt(entry.chainId), url: entry.url.trim(), context });
    }

    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }

    onPaymasterApply?.({ chains });
    setIsFormOpen(false);
  };

  const handleRemovePaymaster = () => {
    onPaymasterApply?.(null);
    setIsFormOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={`gap-2 ${paymasters ? 'border-emerald-500' : ''}`}
      >
        {paymasters && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        View Config
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) closeForm();
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{modeName} Configuration</DialogTitle>
            <DialogDescription>
              {type === 'wagmi' ? 'Wagmi connector configuration for your app' : 'Core SDK configuration for your app'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {/* Code Block */}
            <div className="border-border rounded-md border">
              <div className="bg-muted/50 border-border flex items-center justify-between border-b px-4 py-2">
                <span className="text-muted-foreground font-mono text-sm font-medium">{fileName}</span>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted border-border flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="bg-muted/20 max-h-[40vh] overflow-auto">
                <pre className="p-4 text-sm leading-relaxed">
                  <code className="text-foreground/90 whitespace-pre font-mono">{code}</code>
                </pre>
              </div>
            </div>

            {/* Paymaster Section */}
            {onPaymasterApply && (
              <div className="border-border rounded-md border">
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Paymaster</span>
                    {paymasters && !isFormOpen && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {paymasters.chains.length} chain{paymasters.chains.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {isFormOpen ? (
                      <button
                        onClick={closeForm}
                        className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    ) : paymasters ? (
                      <>
                        <button
                          onClick={() => openForm(true)}
                          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={handleRemovePaymaster}
                          className="text-destructive hover:text-destructive/80 text-xs transition-colors"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => openForm()}
                        className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
                      >
                        + Add Paymaster
                      </button>
                    )}
                  </div>
                </div>

                {/* Configured chains summary */}
                {paymasters && !isFormOpen && (
                  <div className="border-border bg-muted/10 space-y-1.5 border-t px-4 py-3">
                    {paymasters.chains.map((chain) => (
                      <div
                        key={chain.chainId}
                        className="text-muted-foreground flex items-center gap-2 font-mono text-xs"
                      >
                        <span className="text-foreground font-semibold">{chain.chainId}</span>
                        <span>→</span>
                        <span className="truncate">{chain.url}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline form */}
                {isFormOpen && (
                  <div className="border-border space-y-3 border-t px-4 py-3">
                    {entries.map((entry, i) => (
                      <div key={i} className="bg-muted/20 border-border space-y-2 rounded-md border p-3">
                        {entries.length > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground text-xs font-medium">Chain {i + 1}</span>
                            <button
                              onClick={() => removeEntry(i)}
                              className="text-destructive hover:text-destructive/80 text-xs transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">
                              Chain ID <span className="text-destructive">*</span>
                            </label>
                            <input
                              type="text"
                              value={entry.chainId}
                              onChange={(e) => updateEntry(i, 'chainId', e.target.value)}
                              placeholder="84532"
                              className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-2.5 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <label className="text-xs font-medium">
                              URL <span className="text-destructive">*</span>
                            </label>
                            <input
                              type="text"
                              value={entry.url}
                              onChange={(e) => updateEntry(i, 'url', e.target.value)}
                              placeholder="https://paymaster.example.com/rpc"
                              className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-2.5 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-muted-foreground text-xs font-medium">
                            Context <span className="font-normal">(optional JSON)</span>
                          </label>
                          <textarea
                            value={entry.contextJson}
                            onChange={(e) => updateEntry(i, 'contextJson', e.target.value)}
                            placeholder={`{ "sponsorshipPolicyId": "your-policy-id" }`}
                            rows={2}
                            className="border-input bg-background focus-visible:ring-ring w-full resize-none rounded-md border px-2.5 py-1.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1"
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={addEntry}
                      className="text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground w-full rounded-md border border-dashed py-1.5 text-xs transition-colors"
                    >
                      + Add Chain
                    </button>

                    {formErrors.length > 0 && (
                      <div className="space-y-0.5">
                        {formErrors.map((err, i) => (
                          <p key={i} className="text-destructive text-xs">
                            {err}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleApply} className="flex-1">
                        Apply
                      </Button>
                      {paymasters && (
                        <Button size="sm" variant="outline" onClick={handleRemovePaymaster}>
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
