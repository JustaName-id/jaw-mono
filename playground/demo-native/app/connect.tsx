import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, TouchableOpacity, StyleSheet } from 'react-native';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Label,
  createCredentialAdapter,
  getCredentialAdapter,
  JAWNativeProvider,
  useJAWNative,
} from '@jaw/ui-native';
import { WalletIcon } from '@jaw/ui-native';
import { Account, type PasskeyAccount } from '@jaw.id/core';

// Configuration from environment variables
const CHAIN_ID = parseInt(process.env.EXPO_PUBLIC_DEFAULT_CHAIN_ID || '1', 10);
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';
const RP_ID = process.env.EXPO_PUBLIC_RP_ID || 'keys.jaw.id';
const RP_NAME = process.env.EXPO_PUBLIC_RP_NAME || 'JAW Wallet';
// Keys URL - use environment variable or ngrok tunnel for local testing
const KEYS_URL = process.env.EXPO_PUBLIC_KEYS_URL || 'https://fe5faa0c9705.ngrok-free.app';

// Mode types
type SDKMode = 'cross-platform' | 'app-specific';

interface StoredAccount {
  username: string;
  address: string;
  credentialId: string;
}

// Mode header component (like web demo)
function ModeHeader({ mode, onModeChange }: {
  mode: SDKMode;
  onModeChange: (mode: SDKMode) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>JAW SDK Demo</CardTitle>
        <CardDescription>
          Test both authentication modes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <View style={styles.modeContainer}>
          <Text className="text-sm text-muted-foreground mb-2">Mode:</Text>
          <View style={styles.modeButtons}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'cross-platform' && styles.modeButtonActive,
              ]}
              onPress={() => onModeChange('cross-platform')}
            >
              <Text style={[
                styles.modeButtonText,
                mode === 'cross-platform' && styles.modeButtonTextActive,
              ]}>
                Cross-Platform
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                mode === 'app-specific' && styles.modeButtonActive,
              ]}
              onPress={() => onModeChange('app-specific')}
            >
              <Text style={[
                styles.modeButtonText,
                mode === 'app-specific' && styles.modeButtonTextActive,
              ]}>
                App-Specific
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View className="mt-3 p-3 bg-secondary rounded-lg">
          {mode === 'cross-platform' ? (
            <Text className="text-sm text-muted-foreground">
              <Text className="font-semibold">Cross-Platform Mode:</Text> Opens WebView to keys.jaw.id for authentication. No per-app configuration needed. Works in Expo Go.
            </Text>
          ) : (
            <Text className="text-sm text-muted-foreground">
              <Text className="font-semibold">App-Specific Mode:</Text> Native passkeys via device biometrics. Requires AASA configuration and development build.
            </Text>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

// Cross-platform mode content
function CrossPlatformContent() {
  const { isConnected, address, username, connect, disconnect, signMessage, sendTransaction } = useJAWNative();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageToSign, setMessageToSign] = useState('Hello from JAW Native!');
  const [signature, setSignature] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connect();
    } catch (error) {
      console.error('Connect error:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignMessage = async () => {
    setIsSigning(true);
    setSignature(null);
    try {
      const sig = await signMessage(messageToSign);
      if (sig) {
        setSignature(sig);
        Alert.alert('Success', 'Message signed successfully!');
      } else {
        Alert.alert('Error', 'Failed to sign message');
      }
    } catch (error) {
      console.error('Sign message error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to sign message');
    } finally {
      setIsSigning(false);
    }
  };

  const handleSendTransaction = async () => {
    setIsSending(true);
    setTxHash(null);
    try {
      // Example: Send 0 ETH to self (just for testing)
      const hash = await sendTransaction({
        to: address || '0x0000000000000000000000000000000000000000',
        value: '0x0',
        data: '0x',
      });
      if (hash) {
        setTxHash(hash);
        Alert.alert('Success', `Transaction sent!\n\nHash: ${hash.slice(0, 20)}...`);
      } else {
        Alert.alert('Error', 'Failed to send transaction');
      }
    } catch (error) {
      console.error('Send transaction error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send transaction');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View className="gap-4">
      {/* Connect Card */}
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <WalletIcon width={24} height={24} />
            <CardTitle>Connect Wallet</CardTitle>
          </View>
          <CardDescription>
            Authenticate via Safari View Controller
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          {isConnected && address ? (
            <View className="gap-4">
              <View className="p-4 bg-secondary rounded-lg">
                {username && (
                  <>
                    <Text className="text-sm text-muted-foreground mb-1">
                      Username
                    </Text>
                    <Text className="text-foreground font-semibold mb-3">
                      {username}
                    </Text>
                  </>
                )}
                <Text className="text-sm text-muted-foreground mb-1">
                  Connected Address
                </Text>
                <Text className="text-foreground font-mono text-sm">
                  {address}
                </Text>
              </View>
              <Button variant="outline" onPress={disconnect}>
                Disconnect
              </Button>
            </View>
          ) : (
            <View className="gap-4">
              <Button onPress={handleConnect} disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect with JAW'}
              </Button>
              <Text className="text-xs text-muted-foreground text-center">
                Opens keys.jaw.id in Safari for secure passkey authentication
              </Text>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Sign Message Card - Only show when connected */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Sign Message</CardTitle>
            <CardDescription>
              Sign a message with your passkey
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="gap-2">
              <Label>Message</Label>
              <Input
                value={messageToSign}
                onChangeText={setMessageToSign}
                placeholder="Enter message to sign"
                multiline
              />
            </View>
            <Button onPress={handleSignMessage} disabled={isSigning || !messageToSign}>
              {isSigning ? 'Signing...' : 'Sign Message'}
            </Button>
            {signature && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">Signature</Text>
                <Text className="text-foreground font-mono text-xs" numberOfLines={3}>
                  {signature}
                </Text>
              </View>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send Transaction Card - Only show when connected */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Send Transaction</CardTitle>
            <CardDescription>
              Send a test transaction (0 ETH to self)
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Button onPress={handleSendTransaction} disabled={isSending}>
              {isSending ? 'Sending...' : 'Send Test Transaction'}
            </Button>
            {txHash && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">Transaction Hash</Text>
                <Text className="text-foreground font-mono text-xs" numberOfLines={2}>
                  {txHash}
                </Text>
              </View>
            )}
            <Text className="text-xs text-muted-foreground text-center">
              This will open Safari to confirm the transaction
            </Text>
          </CardContent>
        </Card>
      )}
    </View>
  );
}

// App-specific mode content (original native passkey implementation)
function AppSpecificContent() {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [storedAccounts, setStoredAccounts] = useState<StoredAccount[]>([]);

  useEffect(() => {
    loadStoredAccounts();
  }, []);

  const loadStoredAccounts = () => {
    try {
      const accounts = Account.getStoredAccounts(API_KEY);
      const mapped: StoredAccount[] = accounts.map((acc: PasskeyAccount & { address?: string }) => ({
        username: acc.username,
        address: acc.address || '',
        credentialId: acc.credentialId,
      }));
      setStoredAccounts(mapped);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const handleCreateAccount = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return;
    }

    const usernameRegex = /^[a-z0-9-]+$/;
    if (!usernameRegex.test(username)) {
      Alert.alert('Error', 'Username can only contain lowercase letters, numbers, and hyphens');
      return;
    }

    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    setIsLoading(true);

    try {
      const newAccount = await Account.create(
        { chainId: CHAIN_ID, apiKey: API_KEY },
        { username, rpId: RP_ID, rpName: RP_NAME, createFn: createCredentialAdapter }
      );

      const address = await newAccount.getAddress();
      setConnectedAddress(address);
      setConnectedUsername(username);
      loadStoredAccounts();

      Alert.alert('Success', `Account created!\n\nAddress: ${address.slice(0, 10)}...${address.slice(-8)}`);
    } catch (error) {
      console.error('Failed to create account:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          return;
        }
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to create account');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportAccount = async () => {
    setIsLoading(true);

    try {
      const importedAccount = await Account.import(
        { chainId: CHAIN_ID, apiKey: API_KEY },
        { getFn: getCredentialAdapter }
      );

      const address = await importedAccount.getAddress();
      const metadata = importedAccount.getMetadata();
      setConnectedAddress(address);
      setConnectedUsername(metadata?.username || 'Imported Account');
      loadStoredAccounts();

      Alert.alert('Success', `Account imported!\n\nAddress: ${address.slice(0, 10)}...${address.slice(-8)}`);
    } catch (error) {
      console.error('Failed to import account:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          return;
        }
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to import account');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAccount = async (account: StoredAccount) => {
    setIsLoading(true);

    try {
      const loadedAccount = await Account.get(
        { chainId: CHAIN_ID, apiKey: API_KEY },
        account.credentialId,
        { getFn: getCredentialAdapter }
      );

      const address = await loadedAccount.getAddress();
      setConnectedAddress(address);
      setConnectedUsername(account.username);

      Alert.alert('Connected', `Authenticated as ${account.username}`);
    } catch (error) {
      console.error('Failed to authenticate:', error);
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          return;
        }
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'Failed to authenticate');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    setConnectedAddress(null);
    setConnectedUsername(null);
    setUsername('');
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <WalletIcon width={24} height={24} />
          <CardTitle>Connect Wallet</CardTitle>
        </View>
        <CardDescription>
          Create or import using native passkeys
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {connectedAddress ? (
          <View className="gap-4">
            <View className="p-4 bg-secondary rounded-lg">
              <Text className="text-sm text-muted-foreground mb-1">
                Connected as
              </Text>
              <Text className="text-foreground font-semibold text-lg mb-2">
                {connectedUsername}
              </Text>
              <Text className="text-sm text-muted-foreground mb-1">
                Address
              </Text>
              <Text className="text-foreground font-mono text-sm">
                {connectedAddress}
              </Text>
            </View>
            <Button variant="outline" onPress={handleDisconnect}>
              Disconnect
            </Button>
          </View>
        ) : (
          <>
            {storedAccounts.length > 0 && (
              <View className="gap-2">
                <Label>Stored Accounts</Label>
                {storedAccounts.map((account) => (
                  <Button
                    key={account.credentialId}
                    variant="outline"
                    onPress={() => handleSelectAccount(account)}
                    disabled={isLoading}
                    className="justify-start"
                  >
                    <Text className="text-foreground">
                      {account.username}
                    </Text>
                  </Button>
                ))}
                <View className="flex-row items-center gap-2 py-2">
                  <View className="flex-1 h-[1px] bg-border" />
                  <Text className="text-muted-foreground text-sm">or create new</Text>
                  <View className="flex-1 h-[1px] bg-border" />
                </View>
              </View>
            )}

            <View className="gap-2">
              <Label>Username</Label>
              <Input
                placeholder="Enter your username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text className="text-xs text-muted-foreground">
                This will be your account name (e.g., username.jaw.eth)
              </Text>
            </View>

            <Button
              onPress={handleCreateAccount}
              isLoading={isLoading}
              disabled={!username.trim()}
            >
              Create Account with Passkey
            </Button>

            <View className="flex-row items-center gap-2 py-2">
              <View className="flex-1 h-[1px] bg-border" />
              <Text className="text-muted-foreground text-sm">or</Text>
              <View className="flex-1 h-[1px] bg-border" />
            </View>

            <Button
              variant="outline"
              onPress={handleImportAccount}
              isLoading={isLoading}
            >
              Import Existing Account
            </Button>

            {/* Warning about AASA requirement */}
            <View className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-2">
              <Text className="text-xs text-yellow-800 dark:text-yellow-200">
                Note: App-Specific mode requires AASA configuration and a development build. Use Cross-Platform mode for testing in Expo Go.
              </Text>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Main screen with mode toggle
export default function ConnectScreen() {
  const [mode, setMode] = useState<SDKMode>('cross-platform');

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        <ModeHeader mode={mode} onModeChange={setMode} />

        {mode === 'cross-platform' ? (
          <JAWNativeProvider
            apiKey={API_KEY}
            appName="JAW Demo Native"
            defaultChainId={CHAIN_ID}
            keysUrl={KEYS_URL}
            showTestnets={true}
          >
            <CrossPlatformContent />
          </JAWNativeProvider>
        ) : (
          <AppSpecificContent />
        )}

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="flex-row gap-3">
              <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                <Text className="text-primary-foreground text-xs font-bold">1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-medium">Choose Mode</Text>
                <Text className="text-muted-foreground text-sm">
                  Cross-Platform (WebView) or App-Specific (native passkeys)
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                <Text className="text-primary-foreground text-xs font-bold">2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-medium">Authenticate</Text>
                <Text className="text-muted-foreground text-sm">
                  Use Face ID, Touch ID, or device PIN
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                <Text className="text-primary-foreground text-xs font-bold">3</Text>
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-medium">Ready to Use</Text>
                <Text className="text-muted-foreground text-sm">
                  Your smart wallet is ready for transactions
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  modeContainer: {
    marginBottom: 8,
  },
  modeButtons: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
});
