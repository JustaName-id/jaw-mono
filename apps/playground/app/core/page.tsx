'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { JAW, Mode } from '@jaw.id/core';
import { ReactUIHandler } from '@jaw.id/ui';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

import { MethodCard } from '../../components/method-card';
import { MethodModal } from '../../components/method-modal';
import { ExecutionLog, type LogEntry } from '../../components/execution-log';
import {
  RPC_METHODS,
  CATEGORIES,
  CATEGORY_LABELS,
  type RpcMethod,
  type MethodCategory,
} from '../../lib/rpc-methods';

type ModeType = (typeof Mode)[keyof typeof Mode];

function CorePageContent({ mode }: { mode: ModeType }) {
  const [isConnected, setIsConnected] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [chainId, setChainId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<RpcMethod | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MethodCategory | 'all'>('all');

  const [sdk] = useState(() =>
    JAW.create({
      appName: 'JAW Playground',
      appLogoUrl: 'https://avatars.githubusercontent.com/u/159771991?s=200&v=4',
      defaultChainId: 10,
      preference: {
        keysUrl: 'http://localhost:3001',
        showTestnets: true,
        mode: mode,
        uiHandler: mode === Mode.AppSpecific ? new ReactUIHandler() : undefined,
      },
      apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
    })
  );

  const addLog = useCallback((type: LogEntry['type'], method: string, data: unknown) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, method, data }]);
  }, []);

  const handleExecute = useCallback(
    async (method: string, params: unknown[]): Promise<unknown> => {
      addLog('request', method, params);

      try {
        const result = await sdk.provider.request({
          method,
          params,
        });

        addLog('response', method, result);

        // Handle connection state updates
        if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
          let connectedAccounts: string[] = [];
          if (Array.isArray(result)) {
            connectedAccounts = result as string[];
          } else if (result && typeof result === 'object' && 'accounts' in result) {
            const walletConnectResponse = result as { accounts: { address: string }[] };
            connectedAccounts = walletConnectResponse.accounts.map((acc) => acc.address);
          }
          if (connectedAccounts.length > 0) {
            setAccounts(connectedAccounts);
            setIsConnected(true);
            // Get chain ID after connect
            const chainIdResult = await sdk.provider.request({
              method: 'eth_chainId',
              params: [],
            });
            setChainId(chainIdResult as string);
          }
        } else if (method === 'wallet_disconnect') {
          setIsConnected(false);
          setAccounts([]);
          setChainId(null);
        } else if (method === 'wallet_switchEthereumChain') {
          // Update chain ID after switch
          const chainIdResult = await sdk.provider.request({
            method: 'eth_chainId',
            params: [],
          });
          setChainId(chainIdResult as string);
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : JSON.stringify(error);
        addLog('error', method, errorMessage);
        throw error;
      }
    },
    [sdk, addLog]
  );

  const handleMethodClick = (method: RpcMethod) => {
    setSelectedMethod(method);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMethod(null);
  };

  const filteredMethods =
    selectedCategory === 'all'
      ? RPC_METHODS
      : RPC_METHODS.filter((m) => m.category === selectedCategory);

  return (
    <div className="min-h-screen p-4 md:p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            JAW SDK Playground - Core
          </h1>
          <p className="text-muted-foreground">
            Test RPC methods using the @jaw.id/core provider
          </p>
        </div>

        {/* Mode Toggle */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Mode:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  mode === Mode.AppSpecific
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}
              >
                {mode === Mode.AppSpecific ? 'App-Specific' : 'Cross-Platform'}
              </span>
            </div>
            <div className="flex gap-2">
              <a
                href="/core?mode=app-specific"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  mode === Mode.AppSpecific
                    ? 'bg-purple-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                App-Specific
              </a>
              <a
                href="/core?mode=cross-platform"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  mode === Mode.CrossPlatform
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Cross-Platform
              </a>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {mode === Mode.AppSpecific
              ? 'App-Specific mode: Direct signing with UI handled by ReactUIHandler in your app.'
              : 'Cross-Platform mode: Uses popup authentication via keys.jaw.id.'}
          </p>
        </Card>

        {/* Connection Status */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-3">Connection Status</h2>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={`font-medium ${
                      isConnected ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {accounts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Account:</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(accounts[0] || '');
                      }}
                      className="bg-muted px-2 py-0.5 rounded text-xs font-mono hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-1"
                      title="Click to copy"
                    >
                      {accounts[0]?.slice(0, 6)}...{accounts[0]?.slice(-4)}
                      <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
                {chainId && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Chain:</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(chainId || '');
                      }}
                      className="bg-muted px-2 py-0.5 rounded text-xs font-mono hover:bg-muted/80 transition-colors cursor-pointer flex items-center gap-1"
                      title="Click to copy"
                    >
                      {chainId}
                      <svg className="w-3 h-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {!isConnected ? (
                <Button
                  onClick={() => {
                    const connectMethod = RPC_METHODS.find((m) => m.id === 'wallet_connect');
                    if (connectMethod) handleMethodClick(connectMethod);
                  }}
                >
                  Connect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    const disconnectMethod = RPC_METHODS.find((m) => m.id === 'wallet_disconnect');
                    if (disconnectMethod) handleMethodClick(disconnectMethod);
                  }}
                >
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
          >
            All ({RPC_METHODS.length})
          </Button>
          {CATEGORIES.map((category) => {
            const count = RPC_METHODS.filter((m) => m.category === category).length;
            return (
              <Button
                key={category}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category]} ({count})
              </Button>
            );
          })}
        </div>

        {/* Method Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMethods.map((method) => (
            <MethodCard
              key={method.id}
              method={method}
              onClick={() => handleMethodClick(method)}
              disabled={method.requiresConnection && !isConnected}
            />
          ))}
        </div>

        {/* Activity Log */}
        <ExecutionLog logs={logs} onClear={() => setLogs([])} />

        {/* Method Modal */}
        <MethodModal
          method={selectedMethod}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onExecute={handleExecute}
          context={{ address: accounts[0], chainId: chainId || undefined }}
          isConnected={isConnected}
        />
      </div>
    </div>
  );
}

function CorePageInner() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');

  const mode: ModeType =
    modeParam === 'cross-platform' ? Mode.CrossPlatform : Mode.AppSpecific;

  return <CorePageContent key={mode} mode={mode} />;
}

export default function CorePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen p-8 bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <CorePageInner />
    </Suspense>
  );
}
