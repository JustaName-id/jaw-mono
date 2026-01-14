import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as ExpoClipboard from 'expo-clipboard';
import { DefaultModal } from '../DefaultModal';
import { Button } from '../ui/button';
import { CopyIcon, CopiedIcon, WalletIcon, WarningIcon, InfoIcon } from '../../icons';
import { formatAddress } from '../../utils/formatAddress';
import { getJustaNameInstance } from '../../utils/justaNameInstance';
import { useDeviceType } from '../../hooks/useDeviceType';
import type { PermissionModalProps } from './types';

export const PermissionModal = ({
  open,
  onOpenChange,
  mode,
  permissionId,
  spenderAddress,
  origin,
  spends = [],
  calls = [],
  expiryDate,
  networkName,
  chainId,
  chainIcon,
  onConfirm,
  onCancel,
  isProcessing,
  status,
  isLoadingTokenInfo = false,
  timestamp = new Date(),
  warningMessage,
}: PermissionModalProps) => {
  const [isPermissionIdCopied, setIsPermissionIdCopied] = useState(false);
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({});
  const [isResolvingAddresses, setIsResolvingAddresses] = useState(true);
  const { isPhone } = useDeviceType();

  // Resolve addresses to human-readable names
  useEffect(() => {
    if (!chainId) {
      setIsResolvingAddresses(false);
      return;
    }

    // Try to initialize JustaName SDK - if it fails, skip resolution
    let justaName;
    try {
      justaName = getJustaNameInstance();
    } catch (error) {
      console.warn('Address resolution unavailable:', error);
      setIsResolvingAddresses(false);
      return;
    }

    const addressesToResolve: string[] = [];

    if (spenderAddress) {
      addressesToResolve.push(spenderAddress);
    }

    calls.forEach((call) => {
      if (call.target && !addressesToResolve.includes(call.target)) {
        addressesToResolve.push(call.target);
      }
    });

    if (addressesToResolve.length === 0) {
      setIsResolvingAddresses(false);
      return;
    }

    setIsResolvingAddresses(true);

    const resolvePromises = addressesToResolve.map(async (address) => {
      try {
        const result = await justaName.subnames.reverseResolve({
          address: address as `0x${string}`,
          chainId: chainId,
        });
        if (result) {
          return { address, name: result };
        }
      } catch {
        // Silently fail if resolution fails
      }
      return null;
    });

    // Add timeout to prevent infinite loading
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );

    Promise.race([Promise.all(resolvePromises), timeoutPromise]).then((results) => {
      if (results) {
        const newResolved: Record<string, string> = {};
        results.forEach((result) => {
          if (result) {
            newResolved[result.address] = result.name;
          }
        });
        setResolvedAddresses((prev) => ({ ...prev, ...newResolved }));
      }
      setIsResolvingAddresses(false);
    });
  }, [spenderAddress, calls, chainId]);

  const copyToClipboard = async (text: string, setCopied: (value: boolean) => void) => {
    try {
      await ExpoClipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Silently fail if clipboard is not available
    }
  };

  const canConfirm = !isProcessing && !isLoadingTokenInfo && !isResolvingAddresses;

  // Count total permissions
  const totalSpends = spends.length;
  const totalCalls = calls.length;
  const totalPermissions = totalSpends + totalCalls;

  const formattedDate = timestamp.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const formattedTime = timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <DefaultModal
      open={open}
      onOpenChange={isProcessing ? undefined : onOpenChange}
      title={mode === 'grant' ? 'Permission Request' : 'Revoke Permission'}
    >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Timestamp */}
        <View className="mb-4">
          <Text className="text-xs font-bold text-muted-foreground">
            {formattedDate} at {formattedTime}
          </Text>
        </View>

        {/* Permission ID Card - Only for revoke mode */}
        {mode === 'revoke' && permissionId && (
          <View className="flex-row items-start justify-between p-3.5 border border-border rounded-md mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-xs font-bold text-foreground mb-1">Permission ID</Text>
              <Text className="text-sm text-foreground" numberOfLines={3}>
                {permissionId}
              </Text>
            </View>
            <Pressable onPress={() => copyToClipboard(permissionId, setIsPermissionIdCopied)}>
              {isPermissionIdCopied ? (
                <CopiedIcon width={16} height={16} />
              ) : (
                <CopyIcon width={16} height={16} />
              )}
            </Pressable>
          </View>
        )}

        {/* Requesting dApp + Spender Address */}
        <View className="flex-row justify-between items-center p-3.5 border border-border rounded-md mb-3">
          <View className="flex-1">
            <Text className="text-xs font-bold text-foreground">Requesting dApp</Text>
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {origin}
            </Text>
          </View>
          <View className="w-px h-12 bg-border mx-2" />
          <View className="flex-1">
            <Text className="text-xs font-bold text-foreground">Spender Address</Text>
            <View className="flex-row items-center gap-1">
              <WalletIcon width={12} height={12} stroke="#000" />
              <Text className="text-sm text-foreground" numberOfLines={1}>
                {resolvedAddresses[spenderAddress] || formatAddress(spenderAddress)}
              </Text>
            </View>
          </View>
        </View>

        {/* Network and Expiry */}
        <View className="flex-row justify-between items-center p-3.5 border border-border rounded-md mb-3">
          <View className="flex-1">
            <Text className="text-xs font-bold text-foreground">Network</Text>
            <View className="flex-row items-center gap-1">
              {chainIcon}
              <Text className="text-sm text-foreground">{networkName}</Text>
            </View>
          </View>
          <View className="w-px h-12 bg-border mx-2" />
          <View className="flex-1">
            <Text className="text-xs font-bold text-foreground">Expiry Date</Text>
            <Text className="text-sm text-foreground">{expiryDate}</Text>
          </View>
        </View>

        {/* Spend Permissions Section */}
        {totalSpends > 0 && (
          <View className="mb-3">
            <Text className="text-sm font-bold text-foreground mb-2 px-1">
              Spend Permissions ({totalSpends})
            </Text>
            {spends.map((spend, index) => (
              <View
                key={index}
                className="p-3.5 border border-border rounded-md bg-background mb-2"
              >
                {/* Amount */}
                <View className="mb-3">
                  <Text className="text-xs font-bold text-muted-foreground">Amount</Text>
                  {isLoadingTokenInfo ? (
                    <View className="h-6 w-32 bg-muted rounded animate-pulse" />
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xl text-foreground">{spend.amount}</Text>
                      {spend.amountUsd && (
                        <Text className="text-sm font-bold text-muted-foreground">
                          ${spend.amountUsd}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                {/* Duration and Token */}
                <View className="flex-row justify-between items-center">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-muted-foreground">Duration</Text>
                    <Text className="text-sm text-foreground">{spend.duration}</Text>
                  </View>
                  <View className="w-px h-10 bg-border mx-2" />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-muted-foreground">Token</Text>
                    <Text className="text-sm text-foreground">{spend.token}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Call Permissions Section */}
        {totalCalls > 0 && (
          <View className="mb-3">
            <Text className="text-sm font-bold text-foreground mb-2 px-1">
              Call Permissions ({totalCalls})
            </Text>
            {calls.map((call, index) => (
              <View
                key={index}
                className="p-3.5 border border-border rounded-md bg-background mb-2"
              >
                <View className="mb-2">
                  <Text className="text-xs font-bold text-muted-foreground">Function</Text>
                  <Text className="text-sm font-mono text-foreground">{call.functionSignature}</Text>
                </View>
                <View>
                  <Text className="text-xs font-bold text-muted-foreground">Contract</Text>
                  <Text className="text-sm font-mono text-foreground" numberOfLines={2}>
                    {resolvedAddresses[call.target] || call.target}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Warning (Grant) / Info (Revoke) Card */}
        {mode === 'grant' ? (
          <View className="flex-row items-start p-3.5 border border-yellow-300 rounded-md bg-yellow-50 mb-3">
            <View className="mr-2 mt-0.5">
              <WarningIcon width={16} height={16} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-yellow-800">Warning</Text>
              <Text className="text-xs text-yellow-900">
                {warningMessage ||
                  `You are granting ${totalPermissions} permission${totalPermissions > 1 ? 's' : ''} to this dApp until ${expiryDate}. Only approve if you trust this dApp.`}
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row items-start p-3.5 border border-blue-300 rounded-md bg-blue-50 mb-3">
            <View className="mr-2 mt-0.5">
              <InfoIcon width={16} height={16} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-blue-800">Info</Text>
              <Text className="text-xs text-blue-900">
                This will revoke all permissions and prevent the spender from making any further
                transactions on your behalf.
              </Text>
            </View>
          </View>
        )}

        {/* Status Message */}
        {status && (
          <View
            className={`p-3 rounded-lg mb-3 ${
              status.includes('Error')
                ? 'bg-red-50'
                : status.includes('successfully')
                  ? 'bg-green-50'
                  : 'bg-blue-50'
            }`}
          >
            <Text
              className={`text-sm ${
                status.includes('Error')
                  ? 'text-red-600'
                  : status.includes('successfully')
                    ? 'text-green-600'
                    : 'text-blue-600'
              }`}
            >
              {status}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View className="flex-row gap-3 pt-4">
        <Button variant="outline" onPress={onCancel} disabled={isProcessing} className="flex-1">
          <Text>Cancel</Text>
        </Button>
        <Button
          variant={mode === 'revoke' ? 'destructive' : 'default'}
          onPress={onConfirm}
          disabled={!canConfirm}
          className="flex-1"
        >
          <Text className="text-white">
            {isProcessing
              ? 'Processing...'
              : isLoadingTokenInfo || isResolvingAddresses
                ? 'Loading...'
                : mode === 'grant'
                  ? 'Accept'
                  : 'Revoke'}
          </Text>
        </Button>
      </View>
    </DefaultModal>
  );
};

export * from './types';
