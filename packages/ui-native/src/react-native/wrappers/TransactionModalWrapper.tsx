import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { TransactionModal } from '../../components/TransactionModal';
import type { TransactionUIRequest, SendTransactionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';

interface TransactionModalWrapperProps {
  request: TransactionUIRequest | SendTransactionUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const TransactionModalWrapper: React.FC<TransactionModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [isSending, setIsSending] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [gasFee, setGasFee] = useState<string | undefined>();
  const [gasFeeUsd, setGasFeeUsd] = useState<string | undefined>();
  const [isEstimatingGas, setIsEstimatingGas] = useState(true);

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  // Extract transactions from request
  const isMultiCall = request.type === 'wallet_sendCalls';
  const transactions = isMultiCall
    ? (request as TransactionUIRequest).data.calls.map((call: any) => ({
        from: '', // Will be filled when account loads
        to: call.to || '',
        value: call.value ? BigInt(call.value).toString() : '0',
        data: call.data || '0x',
      }))
    : [{
        from: '',
        to: (request as SendTransactionUIRequest).data.to || '',
        value: (request as SendTransactionUIRequest).data.value
          ? BigInt((request as SendTransactionUIRequest).data.value).toString()
          : '0',
        data: (request as SendTransactionUIRequest).data.data || '0x',
      }];

  // Check if transaction is sponsored
  const isSponsored = config.paymasterUrl !== undefined;

  // Load account and estimate gas on mount
  useEffect(() => {
    loadAccountAndEstimateGas();
  }, []);

  const loadAccountAndEstimateGas = async () => {
    try {
      const loadedAccount = await Account.get({ chainId, apiKey });
      setAccount(loadedAccount);

      // Update from address in transactions
      const address = await loadedAccount.getAddress();
      transactions.forEach((tx: any) => {
        tx.from = address;
      });

      // Estimate gas
      try {
        const calls = isMultiCall
          ? (request as TransactionUIRequest).data.calls
          : [{
              to: (request as SendTransactionUIRequest).data.to as `0x${string}`,
              value: (request as SendTransactionUIRequest).data.value
                ? BigInt((request as SendTransactionUIRequest).data.value)
                : undefined,
              data: (request as SendTransactionUIRequest).data.data as `0x${string}` | undefined,
            }];

        const gasResult = await loadedAccount.calculateGasCost(calls);
        setGasFee(gasResult.totalEth);
        setGasFeeUsd(gasResult.totalUsd);
      } catch (gasError) {
        console.error('Failed to estimate gas:', gasError);
        setGasFee('Unknown');
      }
    } catch (error) {
      console.error('Failed to load account:', error);
      onReject(new Error('Failed to load account. Please try again.'));
    } finally {
      setIsEstimatingGas(false);
    }
  };

  const handleSend = async () => {
    if (!account) return;

    setIsSending(true);
    setStatus('Sending transaction...');

    try {
      let result;

      if (isMultiCall) {
        const calls = (request as TransactionUIRequest).data.calls;
        result = await account.sendCalls(calls);
      } else {
        const call = {
          to: (request as SendTransactionUIRequest).data.to as `0x${string}`,
          value: (request as SendTransactionUIRequest).data.value
            ? BigInt((request as SendTransactionUIRequest).data.value)
            : undefined,
          data: (request as SendTransactionUIRequest).data.data as `0x${string}` | undefined,
        };
        result = await account.sendTransaction([call]);
      }

      onApprove(result);
    } catch (error) {
      console.error('Failed to send transaction:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }
      setStatus('Transaction failed');
      onReject(error instanceof Error ? error : new Error('Failed to send transaction'));
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    onReject(new Error('User rejected the request'));
  };

  return (
    <TransactionModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      transactions={transactions}
      gasFee={gasFee}
      gasFeeUsd={gasFeeUsd}
      isSponsored={isSponsored}
      networkName={chainName}
      chainIcon={chainIcon}
      onConfirm={handleSend}
      onCancel={handleCancel}
      isProcessing={isSending}
      isEstimatingGas={isEstimatingGas}
      status={status}
    />
  );
};
