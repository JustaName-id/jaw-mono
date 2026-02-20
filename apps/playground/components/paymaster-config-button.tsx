'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

export type PaymasterApplyConfig = {
  chainId: number;
  url: string;
  context?: Record<string, unknown>;
};

interface PaymasterConfigButtonProps {
  onApply: (config: PaymasterApplyConfig | null) => void;
  isActive?: boolean;
}

export function PaymasterConfigButton({ onApply, isActive }: PaymasterConfigButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [chainId, setChainId] = useState('84532');
  const [url, setUrl] = useState('');
  const [contextJson, setContextJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApply = () => {
    setError(null);
    if (!chainId.trim() || isNaN(parseInt(chainId))) {
      setError('Chain ID is required and must be a number.');
      return;
    }
    if (!url.trim()) {
      setError('Paymaster URL is required.');
      return;
    }
    let context: Record<string, unknown> | undefined;
    if (contextJson.trim()) {
      try {
        context = JSON.parse(contextJson);
      } catch {
        setError('Context JSON is invalid.');
        return;
      }
    }
    onApply({ chainId: parseInt(chainId), url: url.trim(), context });
    setIsOpen(false);
  };

  const handleRemove = () => {
    onApply(null);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={`gap-2 ${isActive ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : ''}`}
      >
        {isActive && (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        )}
        Paymaster
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paymaster Configuration</DialogTitle>
            <DialogDescription>
              Configure a paymaster to sponsor gas fees. Applied to the SDK config.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm-chain-id">
                Chain ID <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pm-chain-id"
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                placeholder="84532"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pm-url">
                Paymaster URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pm-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://paymaster.example.com/rpc"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pm-context">
                Context <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <textarea
                id="pm-context"
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                placeholder={`{ "sponsorshipPolicyId": "your-policy-id" }`}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button onClick={handleApply} className="flex-1">Apply</Button>
              {isActive && (
                <Button variant="outline" onClick={handleRemove}>Remove</Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
