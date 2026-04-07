'use client';

import { useState, useCallback, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Mode, type PaymasterConfig, type JawTheme } from '@jaw.id/core';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ThemePicker } from '../../components/theme-picker';
import { ThemeToggle } from '../../components/theme-toggle';
import { parseEther, formatUnits, type Address } from 'viem';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useBalance,
  useSendTransaction,
  useSignMessage,
  useSignTypedData,
  useConnect as useWagmiConnect,
  useSendCalls,
  useCallsStatus,
} from 'wagmi';
import {
  useConnect,
  useDisconnect,
  useGrantPermissions,
  useRevokePermissions,
  usePermissions,
  useGetAssets,
  useCapabilities,
  useSign,
  useGetCallsHistory,
  type PersonalSignRequestData,
  type TypedDataRequestData,
} from '@jaw.id/wagmi';

import { WagmiProviders } from './providers';
import { type ModeType } from './config';
import { MethodCard } from '../../components/method-card';
import { WagmiMethodModal } from '../../components/wagmi-method-modal';
import { EncodeDataModal } from '../../components/encode-data-modal';
import { ExecutionLog, type LogEntry } from '../../components/execution-log';
import { ConfigSnippet, type PaymasterApplyConfig } from '../../components/config-snippet';
import {
  WAGMI_METHODS,
  CATEGORIES,
  CATEGORY_LABELS,
  type WagmiMethod,
  type MethodCategory,
} from '../../lib/wagmi-methods';

interface WagmiPageContentProps {
  mode: ModeType;
  pmConfig: PaymasterApplyConfig | undefined;
  onPaymasterApply: (config: PaymasterApplyConfig | null) => void;
  theme: JawTheme;
  onThemeChange: (theme: JawTheme) => void;
}

function WagmiPageContent({ mode, pmConfig, onPaymasterApply, theme, onThemeChange }: WagmiPageContentProps) {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address });
  const { connectors } = useWagmiConnect();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { sendCallsAsync } = useSendCalls();

  // JAW Wagmi Hooks
  const { mutateAsync: jawConnect } = useConnect();
  const { mutateAsync: jawDisconnect } = useDisconnect();
  const { mutateAsync: grantPermissions, isPending: isGrantingPermissions } = useGrantPermissions();
  const { mutateAsync: revokePermissions, isPending: isRevokingPermissions } = useRevokePermissions();
  const { mutateAsync: sign, isPending: isSigning } = useSign();

  // State for query addresses (allows querying for arbitrary addresses)
  const [permissionsAddress, setPermissionsAddress] = useState<string | undefined>();
  const [assetsAddress, setAssetsAddress] = useState<string | undefined>();
  const [capabilitiesAddress, setCapabilitiesAddress] = useState<string | undefined>();
  const [callsHistoryAddress, setCallsHistoryAddress] = useState<string | undefined>();

  const {
    data: permissions,
    refetch: refetchPermissions,
    isLoading: isLoadingPermissions,
  } = usePermissions({
    address: (permissionsAddress || address) as Address | undefined,
  });
  const {
    data: assets,
    refetch: refetchAssets,
    isLoading: isLoadingAssets,
  } = useGetAssets({
    address: (assetsAddress || address) as Address | undefined,
  });
  const {
    data: capabilities,
    refetch: refetchCapabilities,
    isLoading: isLoadingCapabilities,
  } = useCapabilities({
    address: (capabilitiesAddress || address) as Address | undefined,
  });
  const {
    data: callsHistory,
    refetch: refetchCallsHistory,
    isLoading: isLoadingCallsHistory,
  } = useGetCallsHistory({
    address: (callsHistoryAddress || address) as Address | undefined,
  });

  // Calls status state
  const [lastBatchId, setLastBatchId] = useState<string>('');
  const {
    data: callsStatus,
    refetch: refetchCallsStatus,
    isLoading: isLoadingCallsStatus,
  } = useCallsStatus({
    id: lastBatchId as `0x${string}`,
    query: { enabled: !!lastBatchId },
  });

  const [selectedMethod, setSelectedMethod] = useState<WagmiMethod | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEncodeModalOpen, setIsEncodeModalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MethodCategory | 'all'>('all');
  const [isExecuting, setIsExecuting] = useState(false);

  const addLog = useCallback((type: LogEntry['type'], method: string, data: unknown) => {
    setLogs((prev) => [...prev, { timestamp: new Date(), type, method, data }]);
  }, []);

  const handleExecute = useCallback(
    async (method: WagmiMethod, params: Record<string, unknown>): Promise<unknown> => {
      addLog('request', method.name, params);
      setIsExecuting(true);

      try {
        let result: unknown;
        const jawConnector = connectors.find((c) => c.id === 'jaw');

        switch (method.hookType) {
          case 'jawConnect': {
            if (jawConnector) {
              result = await jawConnect({ connector: jawConnector });
            }
            break;
          }

          case 'jawDisconnect':
            result = await jawDisconnect({ connector });
            break;

          case 'useSwitchChain':
            result = await switchChainAsync({
              chainId: params.chainId as number,
            });
            break;

          case 'useSendTransaction':
            result = await sendTransactionAsync({
              to: params.to as Address,
              value: parseEther(params.value as string),
              data: params.data as `0x${string}` | undefined,
            });
            break;

          case 'useSignMessage':
            result = await signMessageAsync({
              message: params.message as string,
            });
            break;

          case 'useSignTypedData':
            result = await signTypedDataAsync({
              domain: (params as { domain?: Record<string, unknown> }).domain || {},
              types: (params as { types?: Record<string, unknown> }).types || {},
              primaryType: (params as { primaryType?: string }).primaryType || '',
              message: (params as { message?: Record<string, unknown> }).message || {},
            });
            break;

          case 'useSign':
            result = await sign({
              chainId: params.chainId as number | undefined,
              request: params.request as PersonalSignRequestData | TypedDataRequestData,
            });
            break;

          case 'useSendCalls': {
            const sendCallsResult = await sendCallsAsync({
              calls: params.calls as Array<{
                to: Address;
                value?: bigint;
                data?: `0x${string}`;
              }>,
            });
            setLastBatchId(sendCallsResult.id);
            result = sendCallsResult;
            break;
          }

          case 'useCallsStatus':
            setLastBatchId(params.id as string);
            await refetchCallsStatus();
            result = callsStatus || { status: 'pending' };
            break;

          case 'useCapabilities': {
            const targetAddress = params.address as string | undefined;
            if (targetAddress) {
              flushSync(() => setCapabilitiesAddress(targetAddress));
            }
            const { data } = await refetchCapabilities();
            result = data;
            break;
          }

          case 'useGrantPermissions':
            result = await grantPermissions({
              spender: params.spender as Address,
              expiry: params.expiry as number,
              permissions: params.permissions as Record<string, unknown>,
            });
            break;

          case 'useRevokePermissions':
            result = await revokePermissions({
              id: params.id as `0x${string}`,
            });
            break;

          case 'usePermissions': {
            const targetAddress = (params.address as string) || address;
            if (targetAddress) {
              flushSync(() => setPermissionsAddress(targetAddress));
            }
            const { data } = await refetchPermissions();
            result = data;
            break;
          }

          case 'useGetAssets': {
            const targetAddress = (params.address as string) || address;
            if (targetAddress) {
              flushSync(() => setAssetsAddress(targetAddress));
            }
            const { data } = await refetchAssets();
            result = data;
            break;
          }

          case 'useGetCallsHistory': {
            const targetAddress = (params.address as string) || address;
            if (targetAddress) {
              flushSync(() => setCallsHistoryAddress(targetAddress));
            }
            const { data } = await refetchCallsHistory();
            result = data;
            break;
          }

          default:
            throw new Error(`Unknown hook type: ${method.hookType}`);
        }

        addLog('response', method.name, result);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : JSON.stringify(error);
        addLog('error', method.name, errorMessage);
        throw error;
      } finally {
        setIsExecuting(false);
      }
    },
    [
      address,
      connectors,
      jawConnect,
      jawDisconnect,
      connector,
      switchChainAsync,
      sendTransactionAsync,
      signMessageAsync,
      signTypedDataAsync,
      sign,
      sendCallsAsync,
      capabilities,
      grantPermissions,
      revokePermissions,
      setPermissionsAddress,
      refetchPermissions,
      permissions,
      setAssetsAddress,
      refetchAssets,
      assets,
      setCapabilitiesAddress,
      refetchCapabilities,
      refetchCallsStatus,
      callsStatus,
      setCallsHistoryAddress,
      refetchCallsHistory,
      callsHistory,
      addLog,
    ]
  );

  const handleMethodClick = (method: WagmiMethod) => {
    if (method.category === 'utility') {
      setIsEncodeModalOpen(true);
      return;
    }
    setSelectedMethod(method);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMethod(null);
  };

  const filteredMethods =
    selectedCategory === 'all' ? WAGMI_METHODS : WAGMI_METHODS.filter((m) => m.category === selectedCategory);

  // Check if any operation is pending
  // Using isExecuting as the primary state since we use async versions of hooks
  const isPending =
    isGrantingPermissions ||
    isRevokingPermissions ||
    isSigning ||
    isLoadingPermissions ||
    isLoadingAssets ||
    isLoadingCapabilities ||
    isLoadingCallsStatus ||
    isLoadingCallsHistory ||
    isExecuting;

  return (
    <div className="bg-background min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-foreground text-2xl font-bold md:text-3xl">JAW.id Playground - Wagmi</h1>
          <ThemeToggle />
        </div>

        {/* Mode Toggle */}
        <Card className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-sm font-medium">Mode:</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  mode === Mode.AppSpecific
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}
              >
                {mode === Mode.AppSpecific ? 'App-Specific' : 'Cross-Platform'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ConfigSnippet type="wagmi" mode={mode} paymasters={pmConfig} onPaymasterApply={onPaymasterApply} />
              <a
                href="/wagmi"
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === Mode.CrossPlatform
                    ? 'bg-blue-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                Cross-Platform
              </a>
              <a
                href="/wagmi?mode=app-specific"
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === Mode.AppSpecific
                    ? 'bg-purple-600 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                App-Specific
              </a>
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {mode === Mode.AppSpecific
              ? 'Direct signing with UI handled by UIHandler in your app'
              : 'Passkey operations handled via keys.jaw.id'}
          </p>
        </Card>

        {/* Theme Picker (only for AppSpecific mode which uses ReactUIHandler) */}
        {mode === Mode.AppSpecific && <ThemePicker theme={theme} onThemeChange={onThemeChange} />}

        {/* Connection Status */}
        <Card className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="mb-3 text-lg font-semibold">Connection Status</h2>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status:</span>
                  <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                {address && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Account:</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(address)}
                      className="bg-muted hover:bg-muted/80 flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-mono text-xs transition-colors"
                      title="Click to copy"
                    >
                      {address.slice(0, 6)}...{address.slice(-4)}
                      <svg
                        className="text-muted-foreground h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                )}
                {chainId && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Chain:</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(chainId.toString())}
                      className="bg-muted hover:bg-muted/80 flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-mono text-xs transition-colors"
                      title="Click to copy"
                    >
                      {chainId}
                      <svg
                        className="text-muted-foreground h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  </div>
                )}
                {balance && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Balance:</span>
                    <span className="bg-muted rounded px-2 py-0.5 font-mono text-xs">
                      {parseFloat(formatUnits(balance.value, balance.decimals)).toFixed(4)} {balance.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              {!isConnected ? (
                <Button
                  onClick={() => {
                    const connectMethod = WAGMI_METHODS.find((m) => m.id === 'jaw_connect');
                    if (connectMethod) handleMethodClick(connectMethod);
                  }}
                >
                  Connect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    const disconnectMethod = WAGMI_METHODS.find((m) => m.id === 'jaw_disconnect');
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
            All ({WAGMI_METHODS.length})
          </Button>
          {CATEGORIES.map((category) => {
            const count = WAGMI_METHODS.filter((m) => m.category === category).length;
            if (count === 0) return null;
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMethods.map((method) => (
            <MethodCard
              key={method.id}
              method={{
                id: method.id,
                name: method.name,
                method: method.method,
                category: method.category,
                description: method.description,
                requiresConnection: method.requiresConnection,
              }}
              onClick={() => handleMethodClick(method)}
              disabled={method.requiresConnection && !isConnected}
            />
          ))}
        </div>

        {/* Activity Log */}
        <ExecutionLog logs={logs} onClear={() => setLogs([])} />

        {/* Encode Data Modal */}
        <EncodeDataModal isOpen={isEncodeModalOpen} onClose={() => setIsEncodeModalOpen(false)} />

        {/* Method Modal */}
        <WagmiMethodModal
          method={selectedMethod}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onExecute={handleExecute}
          context={{ address, chainId }}
          isConnected={isConnected}
          isExecuting={isPending}
        />
      </div>
    </div>
  );
}

function WagmiPageInner() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');

  const mode: ModeType = modeParam === 'app-specific' ? Mode.AppSpecific : Mode.CrossPlatform;

  const [paymasters, setPaymasters] = useState<Record<number, PaymasterConfig> | undefined>();
  const [pmConfig, setPmConfig] = useState<PaymasterApplyConfig | undefined>();
  const [theme, setTheme] = useState<JawTheme>({ mode: 'auto' });

  const handlePaymasterApply = (config: PaymasterApplyConfig | null) => {
    if (config) {
      const record: Record<number, PaymasterConfig> = {};
      for (const chain of config.chains) {
        record[chain.chainId] = {
          url: chain.url,
          ...(chain.context && { context: chain.context }),
        };
      }
      setPaymasters(record);
      setPmConfig(config);
    } else {
      setPaymasters(undefined);
      setPmConfig(undefined);
    }
  };

  return (
    <WagmiProviders mode={mode} paymasters={paymasters} theme={theme}>
      <WagmiPageContent
        key={`${mode}-${JSON.stringify(theme)}`}
        mode={mode}
        pmConfig={pmConfig}
        onPaymasterApply={handlePaymasterApply}
        theme={theme}
        onThemeChange={setTheme}
      />
    </WagmiProviders>
  );
}

export default function WagmiPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background flex min-h-screen items-center justify-center p-8">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <WagmiPageInner />
    </Suspense>
  );
}
