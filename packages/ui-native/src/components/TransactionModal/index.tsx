import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, Clipboard as RNClipboard } from 'react-native';
import { DefaultModal } from '../DefaultModal';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { CopyIcon, CopiedIcon } from '../../icons';
import { formatAddress } from '../../utils/formatAddress';
import { TransactionModalProps, TransactionData } from './types';
import { useDeviceType } from '../../hooks/useDeviceType';

export const TransactionModal: React.FC<TransactionModalProps> = ({
  open,
  onOpenChange,
  transactions,
  walletAddress,
  gasFee,
  gasFeeLoading,
  gasEstimationError,
  sponsored,
  ethPrice = 0,
  onConfirm,
  onCancel,
  isProcessing,
  transactionStatus,
  networkName,
  chainIcon,
}) => {
  const { isTablet } = useDeviceType();
  const [copiedField, setCopiedField] = React.useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      RNClipboard.setString(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      Alert.alert('Error', 'Failed to copy');
    }
  };

  // Format ETH value for display
  const formatEthValue = (weiValue?: string) => {
    if (!weiValue || weiValue === '0x0' || weiValue === '0') return '0 ETH';
    try {
      const wei = BigInt(weiValue);
      const eth = Number(wei) / 1e18;
      return `${eth.toFixed(6)} ETH`;
    } catch {
      return weiValue;
    }
  };

  // Calculate USD value
  const getUsdValue = (ethValue: string) => {
    if (!ethPrice) return '';
    try {
      const eth = parseFloat(ethValue);
      const usd = eth * ethPrice;
      return `≈ $${usd.toFixed(2)}`;
    } catch {
      return '';
    }
  };

  const renderTransaction = (tx: TransactionData, index: number) => (
    <View key={index} className="border border-border rounded-md p-3 gap-2">
      {/* From */}
      <View className="flex-row justify-between items-center">
        <Text className="text-xs font-bold text-muted-foreground">From</Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-foreground font-mono">
            {formatAddress(tx.from || walletAddress)}
          </Text>
          <Pressable onPress={() => handleCopy(tx.from || walletAddress, `from-${index}`)}>
            {copiedField === `from-${index}` ? (
              <CopiedIcon width={12} height={12} fill="#22c55e" />
            ) : (
              <CopyIcon width={12} height={12} />
            )}
          </Pressable>
        </View>
      </View>

      {/* To */}
      <View className="flex-row justify-between items-center">
        <Text className="text-xs font-bold text-muted-foreground">To</Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-sm text-foreground font-mono">
            {formatAddress(tx.to)}
          </Text>
          <Pressable onPress={() => handleCopy(tx.to, `to-${index}`)}>
            {copiedField === `to-${index}` ? (
              <CopiedIcon width={12} height={12} fill="#22c55e" />
            ) : (
              <CopyIcon width={12} height={12} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Value */}
      {tx.value && tx.value !== '0x0' && (
        <View className="flex-row justify-between items-center">
          <Text className="text-xs font-bold text-muted-foreground">Value</Text>
          <Text className="text-sm text-foreground">
            {formatEthValue(tx.value)}
          </Text>
        </View>
      )}

      {/* Data */}
      {tx.data && tx.data !== '0x' && (
        <View className="flex-col gap-1">
          <View className="flex-row justify-between items-center">
            <Text className="text-xs font-bold text-muted-foreground">Data</Text>
            <Pressable onPress={() => handleCopy(tx.data || '', `data-${index}`)}>
              {copiedField === `data-${index}` ? (
                <CopiedIcon width={12} height={12} fill="#22c55e" />
              ) : (
                <CopyIcon width={12} height={12} />
              )}
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="bg-secondary/30 rounded p-2"
          >
            <Text className="text-xs text-foreground font-mono">
              {tx.data.length > 100 ? `${tx.data.slice(0, 100)}...` : tx.data}
            </Text>
          </ScrollView>
        </View>
      )}
    </View>
  );

  const headerContent = (
    <View className="flex-col gap-2.5 p-3.5">
      <Text className="text-xs font-bold text-muted-foreground">
        Transaction Request
      </Text>
      <Text className="text-sm text-muted-foreground">
        Review and confirm the transaction
      </Text>
    </View>
  );

  return (
    <DefaultModal
      open={open}
      handleClose={isProcessing ? undefined : onCancel}
      onOpenChange={isProcessing ? undefined : onOpenChange}
      header={headerContent}
      fullScreen={!isTablet}
    >
      <View className="flex-col flex-1 gap-3">
        {/* Title */}
        <View className="items-center p-3.5">
          <Text className="text-xl font-semibold text-foreground">
            Confirm Transaction
          </Text>
          <Text className="text-sm text-muted-foreground text-center mt-1">
            {transactions.length > 1
              ? `${transactions.length} transactions`
              : 'Review the details below'}
          </Text>
        </View>

        {/* Transactions */}
        {transactions.length === 1 ? (
          renderTransaction(transactions[0], 0)
        ) : (
          <Accordion type="single" collapsible className="gap-2">
            {transactions.map((tx, index) => (
              <AccordionItem key={index} value={`tx-${index}`}>
                <AccordionTrigger>
                  <Text className="text-sm font-medium text-foreground">
                    Transaction {index + 1}
                  </Text>
                </AccordionTrigger>
                <AccordionContent>
                  {renderTransaction(tx, index)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}

        {/* Gas Fee */}
        <View className="border border-border rounded-md p-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-xs font-bold text-foreground">
              Estimated Gas Fee
            </Text>
            {gasFeeLoading ? (
              <Spinner size="small" />
            ) : gasEstimationError ? (
              <Text className="text-sm text-destructive">{gasEstimationError}</Text>
            ) : sponsored ? (
              <View className="flex-row items-center gap-1">
                <Text className="text-sm text-green-600 font-medium">Sponsored</Text>
                <Text className="text-xs text-muted-foreground line-through">
                  {gasFee}
                </Text>
              </View>
            ) : (
              <View className="items-end">
                <Text className="text-sm text-foreground">{gasFee}</Text>
                {ethPrice > 0 && (
                  <Text className="text-xs text-muted-foreground">
                    {getUsdValue(gasFee.replace(' ETH', ''))}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Network Info */}
        <View className="flex-row gap-4 border border-border rounded-md p-2">
          <View className="flex-col gap-1 flex-1">
            <Text className="text-xs font-bold text-foreground">Network</Text>
            <View className="flex-row items-center gap-2">
              {chainIcon}
              <Text className="text-sm text-foreground">{networkName}</Text>
            </View>
          </View>
        </View>

        {/* Status */}
        {transactionStatus && (
          <View className="items-center py-2">
            <Text className="text-sm text-muted-foreground">{transactionStatus}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View className="flex-row gap-2 mt-3">
          <Button
            variant="outline"
            onPress={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onPress={onConfirm}
            disabled={isProcessing || gasFeeLoading || !!gasEstimationError}
            isLoading={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Confirming...' : 'Confirm'}
          </Button>
        </View>
      </View>
    </DefaultModal>
  );
};

export * from './types';
export default TransactionModal;
