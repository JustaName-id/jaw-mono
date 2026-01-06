import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, Clipboard as RNClipboard } from 'react-native';
import { DefaultModal } from '../DefaultModal';
import { Button } from '../ui/button';
import { CopyIcon, CopiedIcon } from '../../icons';
import { formatAddress } from '../../utils/formatAddress';
import { SignatureModalProps, SiweModalProps, Eip712ModalProps } from './types';
import { useDeviceType } from '../../hooks/useDeviceType';

/**
 * SignatureModal - For standard personal_sign messages
 */
export const SignatureModal: React.FC<SignatureModalProps> = ({
  open,
  onOpenChange,
  message,
  origin,
  timestamp,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
  canSign = true,
}) => {
  const { isTablet } = useDeviceType();
  const [copied, setCopied] = React.useState(false);

  // Decode hex message if needed
  const decodedMessage = React.useMemo(() => {
    if (message.startsWith('0x')) {
      try {
        const hex = message.slice(2);
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        return new TextDecoder().decode(bytes);
      } catch {
        return message;
      }
    }
    return message;
  }, [message]);

  const handleCopy = async () => {
    try {
      RNClipboard.setString(decodedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Error', 'Failed to copy message');
    }
  };

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
        })}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Sign message request
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
            Sign Message
          </Text>
          <Text className="text-sm text-muted-foreground text-center mt-1">
            Review the message below before signing
          </Text>
        </View>

        {/* Message Content */}
        <View className="border border-border rounded-md p-3 bg-secondary/30">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-foreground">Message</Text>
            <Pressable onPress={handleCopy} className="flex-row items-center gap-1">
              {copied ? (
                <CopiedIcon width={14} height={14} fill="#22c55e" />
              ) : (
                <CopyIcon width={14} height={14} />
              )}
              <Text className="text-xs text-muted-foreground">
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator>
            <Text className="text-sm text-foreground font-mono">
              {decodedMessage}
            </Text>
          </ScrollView>
        </View>

        {/* Account & Network Info */}
        <View className="flex-row gap-4 border border-border rounded-md p-2">
          {accountAddress && (
            <>
              <View className="flex-col gap-1 flex-1">
                <Text className="text-xs font-bold text-foreground">Account</Text>
                <Text className="text-sm text-foreground font-mono">
                  {formatAddress(accountAddress)}
                </Text>
              </View>
              <View className="w-[1px] bg-border" style={{ minHeight: 40 }} />
            </>
          )}
          {chainName && (
            <>
              <View className="flex-col gap-1 flex-1">
                <Text className="text-xs font-bold text-foreground">Network</Text>
                <View className="flex-row items-center gap-2">
                  {chainIcon}
                  <Text className="text-sm text-foreground">{chainName}</Text>
                </View>
              </View>
              <View className="w-[1px] bg-border" style={{ minHeight: 40 }} />
            </>
          )}
          <View className="flex-col gap-1 flex-1">
            <Text className="text-xs font-bold text-foreground">URL</Text>
            <Text className="text-sm text-foreground">{formatOrigin(origin)}</Text>
          </View>
        </View>

        {/* Status */}
        {signatureStatus && (
          <View className="items-center py-2">
            <Text className="text-sm text-muted-foreground">{signatureStatus}</Text>
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
            onPress={onSign}
            disabled={isProcessing || !canSign}
            isLoading={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </View>
      </View>
    </DefaultModal>
  );
};

/**
 * SiweModal - For Sign-In with Ethereum messages
 */
export const SiweModal: React.FC<SiweModalProps> = ({
  open,
  onOpenChange,
  message,
  origin,
  timestamp,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
  canSign = true,
  appName,
  appLogoUrl,
}) => {
  // SIWE modal is similar to SignatureModal but with app branding
  return (
    <SignatureModal
      open={open}
      onOpenChange={onOpenChange}
      message={message}
      origin={origin}
      timestamp={timestamp}
      accountAddress={accountAddress}
      chainName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      onSign={onSign}
      onCancel={onCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={canSign}
    />
  );
};

/**
 * Eip712Modal - For EIP-712 typed data signing
 */
export const Eip712Modal: React.FC<Eip712ModalProps> = ({
  open,
  onOpenChange,
  typedData,
  origin,
  timestamp,
  accountAddress,
  chainName,
  chainId,
  chainIcon,
  onSign,
  onCancel,
  isProcessing,
  signatureStatus,
}) => {
  const { isTablet } = useDeviceType();
  const [copied, setCopied] = React.useState(false);

  // Parse and format typed data
  const formattedData = React.useMemo(() => {
    try {
      const parsed = JSON.parse(typedData);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return typedData;
    }
  }, [typedData]);

  const handleCopy = async () => {
    try {
      RNClipboard.setString(formattedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('Error', 'Failed to copy data');
    }
  };

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
        })}
      </Text>
      <Text className="text-sm text-muted-foreground">
        Sign typed data request (EIP-712)
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
            Sign Typed Data
          </Text>
          <Text className="text-sm text-muted-foreground text-center mt-1">
            Review the structured data below before signing
          </Text>
        </View>

        {/* Typed Data Content */}
        <View className="border border-border rounded-md p-3 bg-secondary/30">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-xs font-bold text-foreground">Typed Data</Text>
            <Pressable onPress={handleCopy} className="flex-row items-center gap-1">
              {copied ? (
                <CopiedIcon width={14} height={14} fill="#22c55e" />
              ) : (
                <CopyIcon width={14} height={14} />
              )}
              <Text className="text-xs text-muted-foreground">
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator>
            <Text className="text-xs text-foreground font-mono">
              {formattedData}
            </Text>
          </ScrollView>
        </View>

        {/* Account & Network Info */}
        <View className="flex-row gap-4 border border-border rounded-md p-2">
          {accountAddress && (
            <>
              <View className="flex-col gap-1 flex-1">
                <Text className="text-xs font-bold text-foreground">Account</Text>
                <Text className="text-sm text-foreground font-mono">
                  {formatAddress(accountAddress)}
                </Text>
              </View>
              <View className="w-[1px] bg-border" style={{ minHeight: 40 }} />
            </>
          )}
          {chainName && (
            <>
              <View className="flex-col gap-1 flex-1">
                <Text className="text-xs font-bold text-foreground">Network</Text>
                <View className="flex-row items-center gap-2">
                  {chainIcon}
                  <Text className="text-sm text-foreground">{chainName}</Text>
                </View>
              </View>
              <View className="w-[1px] bg-border" style={{ minHeight: 40 }} />
            </>
          )}
          <View className="flex-col gap-1 flex-1">
            <Text className="text-xs font-bold text-foreground">URL</Text>
            <Text className="text-sm text-foreground">{formatOrigin(origin)}</Text>
          </View>
        </View>

        {/* Status */}
        {signatureStatus && (
          <View className="items-center py-2">
            <Text className="text-sm text-muted-foreground">{signatureStatus}</Text>
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
            onPress={onSign}
            disabled={isProcessing}
            isLoading={isProcessing}
            className="flex-1"
          >
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </View>
      </View>
    </DefaultModal>
  );
};

export * from './types';
export default SignatureModal;
