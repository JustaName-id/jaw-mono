'use client';

import { useState } from 'react';
import { Mode } from '@jaw.id/core';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@jaw.id/ui';

type ModeType = (typeof Mode)[keyof typeof Mode];
type ConfigType = 'wagmi' | 'core';

interface ConfigSnippetProps {
  type: ConfigType;
  mode: ModeType;
}

const WAGMI_CROSS_PLATFORM = `import { createConfig, http } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    jaw({
      apiKey: 'YOUR_API_KEY',
      appName: 'My App',
      appLogoUrl: 'https://example.com/logo.png',
      // Optional: Issue subnames under your ENS domain
      // Needs to be configured on the JAW Dashboard
      ens: 'myapp.eth',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
});`;

const WAGMI_APP_SPECIFIC = `import { createConfig, http } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { jaw } from '@jaw.id/wagmi';
import { Mode } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    jaw({
      apiKey: 'YOUR_API_KEY',
      appName: 'My App',
      appLogoUrl: 'https://example.com/logo.png',
      // Optional: Issue subnames under your ENS domain
      // Needs to be configured on the JAW Dashboard
      ens: 'myapp.eth',
      preference: {
        mode: Mode.AppSpecific,
        uiHandler: new ReactUIHandler(),
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
});`;

const CORE_CROSS_PLATFORM = `import { JAW } from '@jaw.id/core';

const jaw = JAW.create({
  apiKey: 'YOUR_API_KEY',
  appName: 'My App',
  appLogoUrl: 'https://example.com/logo.png',
  // Optional: Issue subnames under your ENS domain
  // Needs to be configured on the JAW Dashboard
  ens: 'myapp.eth',
});

// Use the EIP-1193 provider
const provider = jaw.provider;`;

const CORE_APP_SPECIFIC = `import { JAW, Mode } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';

const jaw = JAW.create({
  apiKey: 'YOUR_API_KEY',
  appName: 'My App',
  appLogoUrl: 'https://example.com/logo.png',
  // Optional: Issue subnames under your ENS domain
  // Needs to be configured on the JAW Dashboard
  ens: 'myapp.eth',
  preference: {
    mode: Mode.AppSpecific,
    uiHandler: new ReactUIHandler(),
  },
});

// Use the EIP-1193 provider
const provider = jaw.provider;`;

export function ConfigSnippet({ type, mode }: ConfigSnippetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getCode = () => {
    if (type === 'wagmi') {
      return mode === Mode.CrossPlatform ? WAGMI_CROSS_PLATFORM : WAGMI_APP_SPECIFIC;
    }
    return mode === Mode.CrossPlatform ? CORE_CROSS_PLATFORM : CORE_APP_SPECIFIC;
  };

  const code = getCode();
  const modeName = mode === Mode.AppSpecific ? 'App-Specific' : 'Cross-Platform';
  const fileName = type === 'wagmi' ? 'config.ts' : 'setup.ts';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        View Config
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{modeName} Configuration</DialogTitle>
            <DialogDescription>
              {type === 'wagmi'
                ? 'Wagmi connector configuration for your app'
                : 'Core SDK configuration for your app'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden rounded-md border border-border">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
              <span className="text-sm font-medium text-muted-foreground font-mono">
                {fileName}
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted border border-border"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="overflow-auto max-h-[50vh] bg-muted/20">
              <pre className="p-4 text-sm leading-relaxed">
                <code className="font-mono text-foreground/90 whitespace-pre">{code}</code>
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}