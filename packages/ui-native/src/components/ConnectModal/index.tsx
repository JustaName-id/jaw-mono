import React, { useState, useEffect } from 'react';
import { View, Text, Image } from 'react-native';
import { DefaultModal } from '../DefaultModal';
import { Button } from '../ui/button';
import { BadgeDollarIcon, EyeIcon } from '../../icons';
import { formatAddress } from '../../utils/formatAddress';
import { ConnectModalProps } from './types';
import { useDeviceType } from '../../hooks/useDeviceType';

export const ConnectModal: React.FC<ConnectModalProps> = ({
  open,
  onOpenChange,
  appName,
  appLogoUrl,
  origin,
  timestamp,
  accountName,
  walletAddress,
  chainName,
  chainId,
  chainIcon,
  onConnect,
  onCancel,
  isProcessing,
}) => {
  const { isTablet } = useDeviceType();
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  // Use resolved address, then accountName prop, then truncated address
  const displayName = resolvedAddress || accountName;

  // Format origin to display only domain
  const formatOrigin = (url: string) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return origin;
    }
  };

  const headerContent = (
    <View className="flex-col gap-2.5 p-3.5">
      <Text className="text-xs font-bold text-muted-foreground">
        {timestamp.toLocaleDateString('en-US', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}{' '}
        at{' '}
        {timestamp.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </Text>
      <View className="flex-col gap-1">
        <Text className="text-sm text-muted-foreground">
          Sign in as {displayName || formatAddress(walletAddress)}
        </Text>
        {displayName && (
          <Text className="text-sm text-muted-foreground">
            {formatAddress(walletAddress)}
          </Text>
        )}
      </View>
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
        {/* App Logo and Title */}
        <View className="flex-1 flex-col p-3.5 items-center justify-center">
          {appLogoUrl && (
            <Image
              source={{ uri: appLogoUrl }}
              className="w-18 h-18 rounded-full mb-3"
              style={{ width: 72, height: 72 }}
            />
          )}
          <View className="flex-col items-center gap-1">
            <Text className="text-2xl font-normal text-foreground text-center">
              Connect to {appName}
            </Text>
            <Text className="text-base text-muted-foreground text-center">
              This app wants to connect to your wallet
            </Text>
          </View>
        </View>

        {/* Permissions Section */}
        <View className="flex-col gap-2">
          <View className="flex-row items-center gap-2.5 p-3.5 border border-border rounded-md">
            <EyeIcon width={16} height={16} />
            <Text className="text-foreground text-xs flex-1">
              Allow the app to see your addresses
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5 p-3.5 border border-border rounded-md">
            <BadgeDollarIcon width={15} height={15} />
            <Text className="text-foreground text-xs flex-1">
              Allow the app to propose transactions
            </Text>
          </View>
          <View className="flex-row items-center gap-2.5 p-3.5 border border-border rounded-md">
            <BadgeDollarIcon width={15} height={15} />
            <Text className="text-foreground text-xs flex-1">
              The app cannot move funds without your permission
            </Text>
          </View>
        </View>

        {/* Network and URL Information */}
        <View className="flex-row gap-4 border border-border rounded-md p-2">
          {/* Network Column */}
          {chainName && (
            <>
              <View className="flex-col gap-1 flex-1">
                <Text className="text-xs font-bold text-foreground">Network</Text>
                <View className="flex-row items-center gap-2">
                  {chainIcon && (
                    <View className="w-6 h-6 items-center justify-center">
                      {chainIcon}
                    </View>
                  )}
                  <Text className="text-sm text-foreground">{chainName}</Text>
                </View>
              </View>
              {/* Vertical Separator */}
              <View className="w-[1px] bg-border" style={{ minHeight: 40 }} />
            </>
          )}
          {/* URL Column */}
          <View className="flex-col gap-1 flex-1">
            <Text className="text-xs font-bold text-foreground">URL</Text>
            <Text className="text-sm text-foreground">{formatOrigin(origin)}</Text>
          </View>
        </View>

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
            onPress={onConnect}
            disabled={isProcessing}
            isLoading={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Connecting...' : 'Connect'}
          </Button>
        </View>
      </View>
    </DefaultModal>
  );
};

export * from './types';
export default ConnectModal;
