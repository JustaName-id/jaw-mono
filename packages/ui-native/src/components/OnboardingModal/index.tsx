import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, Alert } from 'react-native';
import { DefaultModal } from '../DefaultModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Spinner } from '../ui/spinner';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { WalletIcon } from '../../icons';
import { formatAddress } from '../../utils/formatAddress';
import { OnboardingModalProps, LocalStorageAccount } from './types';
import { useDeviceType } from '../../hooks/useDeviceType';

type ViewState = 'select' | 'create';

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onOpenChange,
  accounts,
  onAccountSelect,
  loggingInAccount,
  onImportAccount,
  isImporting,
  onCreateAccount,
  onAccountCreationComplete,
  isCreating,
  ensDomain = 'jaw.eth',
}) => {
  const { isTablet } = useDeviceType();
  const [viewState, setViewState] = useState<ViewState>(accounts.length > 0 ? 'select' : 'create');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingAvailability] = useState(false);

  const hasAccounts = accounts.length > 0;

  // Validate username
  const validateUsername = (value: string) => {
    if (!value) {
      setUsernameError(null);
      return false;
    }
    if (value.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return false;
    }
    if (!/^[a-z0-9-]+$/.test(value)) {
      setUsernameError('Username can only contain lowercase letters, numbers, and hyphens');
      return false;
    }
    setUsernameError(null);
    return true;
  };

  const handleUsernameChange = (value: string) => {
    const lowercaseValue = value.toLowerCase();
    setUsername(lowercaseValue);
    validateUsername(lowercaseValue);
  };

  const handleCreateAccount = async () => {
    if (!validateUsername(username)) return;

    try {
      await onCreateAccount(username);
      await onAccountCreationComplete();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create account');
    }
  };

  const handleAccountSelect = async (account: LocalStorageAccount) => {
    try {
      await onAccountSelect(account);
    } catch (error) {
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // User cancelled passkey authentication
        return;
      }
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to authenticate');
    }
  };

  const renderAccountItem = ({ item }: { item: LocalStorageAccount }) => {
    const isLoggingIn = loggingInAccount === item.username;

    return (
      <Pressable
        className="flex-row items-center gap-3 p-3 border border-border rounded-lg"
        onPress={() => handleAccountSelect(item)}
        disabled={!!loggingInAccount}
      >
        <Avatar size={40}>
          <AvatarFallback>
            {item.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground">
            {item.username}.{ensDomain}
          </Text>
          <Text className="text-sm text-muted-foreground font-mono">
            {formatAddress(item.address)}
          </Text>
        </View>
        {isLoggingIn && <Spinner size="small" />}
      </Pressable>
    );
  };

  const renderSelectView = () => (
    <View className="flex-col flex-1 gap-4">
      {/* Title */}
      <View className="items-center p-3.5">
        <WalletIcon width={48} height={48} stroke="#18181B" />
        <Text className="text-xl font-semibold text-foreground mt-3">
          Select Account
        </Text>
        <Text className="text-sm text-muted-foreground text-center mt-1">
          Choose an account to continue
        </Text>
      </View>

      {/* Account List */}
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.credentialId}
        renderItem={renderAccountItem}
        ItemSeparatorComponent={() => <View className="h-2" />}
        contentContainerStyle={{ paddingBottom: 16 }}
      />

      {/* Actions */}
      <View className="flex-col gap-2">
        <Button
          variant="outline"
          onPress={onImportAccount}
          disabled={isImporting || !!loggingInAccount}
          isLoading={isImporting}
        >
          {isImporting ? 'Importing...' : 'Import Existing Account'}
        </Button>

        <View className="flex-row items-center gap-2 py-2">
          <View className="flex-1 h-[1px] bg-border" />
          <Text className="text-muted-foreground text-sm">or</Text>
          <View className="flex-1 h-[1px] bg-border" />
        </View>

        <Button
          onPress={() => setViewState('create')}
          disabled={!!loggingInAccount}
        >
          Create New Account
        </Button>
      </View>
    </View>
  );

  const renderCreateView = () => (
    <View className="flex-col flex-1 gap-4">
      {/* Title */}
      <View className="items-center p-3.5">
        <WalletIcon width={48} height={48} stroke="#18181B" />
        <Text className="text-xl font-semibold text-foreground mt-3">
          Create Account
        </Text>
        <Text className="text-sm text-muted-foreground text-center mt-1">
          Create a new passkey-secured wallet
        </Text>
      </View>

      {/* Username Input */}
      <View className="gap-2">
        <Label>Username</Label>
        <View className="flex-row items-center">
          <Input
            placeholder="Enter username"
            value={username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1"
            isInvalid={!!usernameError}
          />
          <Text className="text-muted-foreground ml-2">.{ensDomain}</Text>
        </View>
        {usernameError && (
          <Text className="text-sm text-destructive">{usernameError}</Text>
        )}
        {isCheckingAvailability && (
          <View className="flex-row items-center gap-2">
            <Spinner size="small" />
            <Text className="text-sm text-muted-foreground">Checking availability...</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View className="p-3 bg-secondary/30 rounded-lg">
        <Text className="text-sm text-muted-foreground">
          Your account will be secured with a passkey (Face ID, Touch ID, or device PIN).
          No passwords or seed phrases to remember.
        </Text>
      </View>

      {/* Actions */}
      <View className="flex-col gap-2 mt-auto">
        {hasAccounts && (
          <Button
            variant="outline"
            onPress={() => setViewState('select')}
            disabled={isCreating}
          >
            Back to Account Selection
          </Button>
        )}

        <Button
          onPress={handleCreateAccount}
          disabled={!username || !!usernameError || isCreating || isCheckingAvailability}
          isLoading={isCreating}
        >
          {isCreating ? 'Creating Account...' : 'Create Account'}
        </Button>

        {!hasAccounts && (
          <>
            <View className="flex-row items-center gap-2 py-2">
              <View className="flex-1 h-[1px] bg-border" />
              <Text className="text-muted-foreground text-sm">or</Text>
              <View className="flex-1 h-[1px] bg-border" />
            </View>

            <Button
              variant="outline"
              onPress={onImportAccount}
              disabled={isImporting || isCreating}
              isLoading={isImporting}
            >
              {isImporting ? 'Importing...' : 'Import Existing Account'}
            </Button>
          </>
        )}
      </View>
    </View>
  );

  const headerContent = (
    <View className="flex-col gap-1 p-3.5">
      <Text className="text-xs font-bold text-muted-foreground">
        {viewState === 'select' ? 'Welcome Back' : 'Get Started'}
      </Text>
    </View>
  );

  return (
    <DefaultModal
      open={open}
      onOpenChange={onOpenChange}
      header={headerContent}
      fullScreen={!isTablet}
      showCloseButton={false}
    >
      {viewState === 'select' ? renderSelectView() : renderCreateView()}
    </DefaultModal>
  );
};

export * from './types';
export default OnboardingModal;
