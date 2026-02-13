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
  createNativePasskeyCredential,
  getCredentialAdapter,
  MobileCommunicationAdapter,
  NativePasskeyUnavailableError,
  SignatureModal,
  TransactionModal,
  type TransactionData,
} from '@jaw/ui-native';
import { WalletIcon } from '@jaw/ui-native';
import { JAW, Account, Mode, type PasskeyAccount, type TransactionCall } from '@jaw.id/core';
import type { Address } from 'viem';
import { parseEther } from 'viem';

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
              <Text className="font-semibold">Cross-Platform Mode:</Text> Opens Safari View Controller (iOS) / Chrome Custom Tab (Android) to keys.jaw.id for authentication. Full WebAuthn support. No per-app configuration needed. Works in Expo Go.
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
  // SDK state
  const [sdk, setSdk] = useState<ReturnType<typeof JAW.create> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Operation states
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageToSign, setMessageToSign] = useState('Hello from JAW Native!');
  const [signature, setSignature] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Permissions state
  const [lastPermissionId, setLastPermissionId] = useState<string>();
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // Initialize SDK on mount
  useEffect(() => {
    console.log('🚀 Initializing JAW SDK with MobileCommunicationAdapter...');

    const jawSdk = JAW.create({
      apiKey: API_KEY,
      appName: 'JAW Demo Native',
      defaultChainId: CHAIN_ID,
      preference: {
        mode: Mode.CrossPlatform,
        communicationAdapter: new MobileCommunicationAdapter(),
        keysUrl: KEYS_URL,
        showTestnets: true,
      },
    });

    // Listen to provider events
    jawSdk.provider.on('accountsChanged', (accounts: string[]) => {
      console.log('📡 accountsChanged event:', accounts);
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        // Note: Username would need to be stored separately or retrieved from backend
      } else {
        setAddress(null);
        setUsername(null);
        setIsConnected(false);
      }
    });

    jawSdk.provider.on('disconnect', () => {
      console.log('📡 disconnect event');
      setIsConnected(false);
      setAddress(null);
      setUsername(null);
    });

    jawSdk.provider.on('connect', (info: { chainId: string }) => {
      console.log('📡 connect event:', info);
      setIsConnected(true);
    });

    setSdk(jawSdk);
    console.log('✅ SDK initialized successfully');

    return () => {
      console.log('🧹 Cleaning up SDK...');
      jawSdk.disconnect();
    };
  }, []);

  const handleConnect = async () => {
    if (!sdk) {
      Alert.alert('Error', 'SDK not initialized');
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await sdk.provider.request({
        method: 'eth_requestAccounts',
        params: [],
      }) as string[];


      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        // Note: In production, you'd fetch username from your backend or local storage
        setUsername('user'); // Placeholder
      }
    } catch (error) {
      console.error('❌ Connection failed:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignMessage = async () => {
    if (!sdk || !address) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    setIsSigning(true);
    setSignature(null);
    try {
      const sig = await sdk.provider.request({
        method: 'personal_sign',
        params: [messageToSign, address],
      }) as string;

      setSignature(sig);
      Alert.alert('Success', 'Message signed successfully!');
    } catch (error) {
      console.error('❌ Sign message failed:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to sign message');
    } finally {
      setIsSigning(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!sdk || !address) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    setIsSending(true);
    setTxHash(null);
    try {
      // Use wallet_sendCalls for EIP-5792 compliant transaction
      const result = await sdk.provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: `0x${CHAIN_ID.toString(16)}`,
          from: address,
          calls: [{
            to: address, // Send to self for testing
            value: '0x0',
            data: '0x',
          }],
        }],
      }) as string;

      setTxHash(result);
      Alert.alert('Success', `Transaction sent!\n\nHash: ${result.slice(0, 20)}...`);
    } catch (error) {
      console.error('❌ Send transaction failed:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to send transaction');
    } finally {
      setIsSending(false);
    }
  };

  const handleGrantPermissions = async () => {
    if (!sdk || !address) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    setIsGranting(true);
    try {
      const spenderAddress = '0x23d3957be879aba6ca925ee4f072d1a8c4e8c890';
      const ethLimit = parseEther('0.0001');
      const expiryTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

      // Use wallet_grantPermissions with EIP-7715 format
      const result = await sdk.provider.request({
        method: 'wallet_grantPermissions',
        params: [{
          expiry: expiryTimestamp,
          signer: {
            type: 'account',
            data: {
              id: address,
            },
          },
          permissions: [{
            type: 'native-token-recurring-allowance',
            data: {
              allowance: `0x${ethLimit.toString(16)}`,
              start: Math.floor(Date.now() / 1000),
              period: 2 * 24 * 60 * 60, // 2 days in seconds
              spender: spenderAddress,
            },
            required: true,
          }],
          chainId: `0x${CHAIN_ID.toString(16)}`,
        }],
      }) as any;

      const permissionId = result?.permissionId || result?.grantedPermissions?.[0]?.context;

      if (permissionId) {
        setLastPermissionId(permissionId);
        Alert.alert(
          'Success',
          `Permission granted!\nID: ${permissionId.slice(0, 10)}...`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to grant permissions');
      }
    } catch (error) {
      console.error('❌ Grant permissions failed:', error);
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokePermissions = async () => {
    if (!sdk || !address || !lastPermissionId) {
      Alert.alert('Error', 'No permission to revoke');
      return;
    }

    setIsRevoking(true);
    try {
      await sdk.provider.request({
        method: 'wallet_revokePermissions',
        params: [{
          id: lastPermissionId,
        }],
      });

      Alert.alert('Success', 'Permission revoked successfully');
      setLastPermissionId(undefined);
    } catch (error) {
      console.error('❌ Revoke permissions failed:', error);
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!sdk) return;

    try {
      await sdk.provider.request({
        method: 'wallet_disconnect',
        params: [],
      });

      setIsConnected(false);
      setAddress(null);
      setUsername(null);
      setSignature(null);
      setTxHash(null);
      setLastPermissionId(undefined);
    } catch (error) {
      console.error('❌ Disconnect failed:', error);
      // Still reset local state even if disconnect fails
      setIsConnected(false);
      setAddress(null);
      setUsername(null);
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
              <Button variant="outline" onPress={handleDisconnect}>
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

      {/* Grant Permissions Card - Only show when connected */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Grant Permissions</CardTitle>
            <CardDescription>
              Allow spending tokens and calling functions
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="p-3 bg-secondary rounded-lg">
              <Text className="text-xs font-bold text-foreground mb-1">
                This will grant:
              </Text>
              <Text className="text-xs text-muted-foreground">
                • 0.0001 ETH spending limit per 2 days
              </Text>
              <Text className="text-xs text-muted-foreground">
                • Permission to call transfer function
              </Text>
              <Text className="text-xs text-muted-foreground">
                • Valid for 30 days
              </Text>
            </View>
            <Button onPress={handleGrantPermissions} disabled={isGranting}>
              {isGranting ? 'Granting...' : 'Grant Permissions'}
            </Button>
            {lastPermissionId && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">Last Permission ID</Text>
                <Text className="text-foreground font-mono text-xs" numberOfLines={1}>
                  {lastPermissionId}
                </Text>
              </View>
            )}
            <Text className="text-xs text-muted-foreground text-center">
              Opens permission dialog in Safari for approval
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Revoke Permissions Card - Only show when connected and has permission */}
      {isConnected && lastPermissionId && (
        <Card>
          <CardHeader>
            <CardTitle>Revoke Permissions</CardTitle>
            <CardDescription>
              Remove the granted permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Button variant="destructive" onPress={handleRevokePermissions} disabled={isRevoking}>
              {isRevoking ? 'Revoking...' : 'Revoke Permissions'}
            </Button>
            <Text className="text-xs text-muted-foreground text-center">
              Opens revoke dialog in Safari for confirmation
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

  // Track Account instance for operations
  const [account, setAccount] = useState<Account | null>(null);

  // Sign Message state
  const [messageToSign, setMessageToSign] = useState('Hello from JAW Native!');
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  // Send Transaction state
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [gasFee, setGasFee] = useState<string>('0');
  const [gasFeeLoading, setGasFeeLoading] = useState(false);

  // Permissions state
  const [lastPermissionId, setLastPermissionId] = useState<string>();
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

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
      // Failed to load accounts
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
      // 🔍 Debug logging - Check configuration
      console.log('🔧 Creating passkey with config:', {
        username,
        rpId: RP_ID,
        rpName: RP_NAME,
        chainId: CHAIN_ID,
        apiKey: API_KEY ? `${API_KEY.slice(0, 8)}...` : 'MISSING',
        keysUrl: KEYS_URL,
      });

      const newAccount = await Account.create(
        { chainId: CHAIN_ID, apiKey: API_KEY },
        { username, rpId: RP_ID, rpName: RP_NAME, nativeCreateFn: createNativePasskeyCredential, getFn: getCredentialAdapter }
      );

      const address = await newAccount.getAddress();

      setAccount(newAccount);
      setConnectedAddress(address);
      setConnectedUsername(username);
      loadStoredAccounts();

      console.log('✅ Account created successfully:', address);
      Alert.alert('Success', `Account created!\n\nAddress: ${address.slice(0, 10)}...${address.slice(-8)}`);
    } catch (error) {
      // 🔍 Enhanced error logging - Show full error object
      console.error('❌ Account creation failed:', error);
      console.error('Error details (full):', JSON.stringify(error, null, 2));
      console.error('Error type:', typeof error);
      console.error('Error keys:', error ? Object.keys(error as object) : 'none');

      if (error instanceof Error) {
        console.error('Error is instance of Error:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          console.log('⚠️ User cancelled passkey creation');
          return;
        }
        // Show helpful message for Expo Go users
        if (error.name === 'NativePasskeyUnavailableError' || error instanceof NativePasskeyUnavailableError) {
          console.error('⚠️ Native passkey unavailable - development build required');
          Alert.alert(
            'Development Build Required',
            'Native passkeys are not available in Expo Go.\n\nPlease use Cross-Platform mode, or create a development build:\n\nnpx expo prebuild\nnpx expo run:ios',
            [{ text: 'OK' }]
          );
          return;
        }
        Alert.alert('Error', `Failed to create account:\n\n${error.message}`);
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
        { getFn: getCredentialAdapter, rpId: RP_ID }
      );

      const address = await importedAccount.getAddress();
      const metadata = importedAccount.getMetadata();

      setAccount(importedAccount);
      setConnectedAddress(address);
      setConnectedUsername(metadata?.username || 'Imported Account');
      loadStoredAccounts();

      Alert.alert('Success', `Account imported!\n\nAddress: ${address.slice(0, 10)}...${address.slice(-8)}`);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          return;
        }
        // Show helpful message for Expo Go users
        if (error.name === 'NativePasskeyUnavailableError' || error instanceof NativePasskeyUnavailableError) {
          Alert.alert(
            'Development Build Required',
            'Native passkeys are not available in Expo Go.\n\nPlease use Cross-Platform mode, or create a development build:\n\nnpx expo prebuild\nnpx expo run:ios',
            [{ text: 'OK' }]
          );
          return;
        }
        // Handle PasskeyLookupError - no passkey found for this RP_ID
        if (error.name === 'PasskeyLookupError' || error.message.includes('PasskeyLookupError')) {
          Alert.alert(
            'No Passkey Found',
            'No passkey was found for this app. Please create a new account first, then you can import it on other devices.',
            [{ text: 'OK' }]
          );
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

  const handleSelectAccount = async (storedAccount: StoredAccount) => {
    setIsLoading(true);

    try {
      const loadedAccount = await Account.get(
        { chainId: CHAIN_ID, apiKey: API_KEY },
        storedAccount.credentialId,
        { getFn: getCredentialAdapter }
      );

      const address = await loadedAccount.getAddress();

      setAccount(loadedAccount);
      setConnectedAddress(address);
      setConnectedUsername(storedAccount.username);

      Alert.alert('Connected', `Authenticated as ${storedAccount.username}`);
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          return;
        }
        // Show helpful message for Expo Go users
        if (error.name === 'NativePasskeyUnavailableError' || error instanceof NativePasskeyUnavailableError) {
          Alert.alert(
            'Development Build Required',
            'Native passkeys are not available in Expo Go.\n\nPlease use Cross-Platform mode, or create a development build:\n\nnpx expo prebuild\nnpx expo run:ios',
            [{ text: 'OK' }]
          );
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
    setAccount(null);
    setConnectedAddress(null);
    setConnectedUsername(null);
    setUsername('');
    setSignature(null);
    setTxHash(null);
  };

  // Sign Message handlers
  const handleOpenSignModal = () => {
    setShowSignModal(true);
  };

  const handleSignMessage = async () => {
    if (!account || !messageToSign) return;

    setIsSigning(true);
    try {
      const sig = await account.signMessage(messageToSign);
      setSignature(sig);
      setShowSignModal(false);
      Alert.alert('Success', 'Message signed successfully!');
    } catch (error) {
      if (error instanceof Error && error.name !== 'NotAllowedError') {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsSigning(false);
    }
  };

  const handleCancelSign = () => {
    setShowSignModal(false);
  };

  // Send Transaction handlers
  const testTransaction: TransactionCall = {
    to: (connectedAddress || '0x0000000000000000000000000000000000000000') as Address,
    value: '0x0',
    data: '0x',
  };

  // For modal display (TransactionData format)
  const testTransactionForModal: TransactionData = {
    to: connectedAddress || '0x0000000000000000000000000000000000000000',
    value: '0',
    data: '0x',
  };

  const handleOpenTxModal = async () => {
    if (!account) return;

    setShowTxModal(true);
    setGasFeeLoading(true);

    try {
      const gasCost = await account.calculateGasCost([testTransaction]);
      setGasFee(gasCost);
    } catch (error) {
      setGasFee('0');
    } finally {
      setGasFeeLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!account) return;

    setIsSending(true);
    try {
      const hash = await account.sendTransaction([testTransaction]);
      setTxHash(hash);
      setShowTxModal(false);
      Alert.alert('Success', `Transaction sent!\n\nHash: ${hash.slice(0, 20)}...`);
    } catch (error) {
      if (error instanceof Error && error.name !== 'NotAllowedError') {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCancelTx = () => {
    setShowTxModal(false);
  };

  const handleGrantPermissions = async () => {
    if (!account || !connectedAddress) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    console.log('🔐 [App-Specific] Starting grantPermissions...');
    console.log('🔐 [App-Specific] Connected address:', connectedAddress);

    setIsGranting(true);
    try {
      const spenderAddress = '0x23d3957be879aba6ca925ee4f072d1a8c4e8c890';
      const ethLimit = parseEther('0.0001');
      const expiryTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

      const permissions = {
        spends: [{
          token: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address,
          allowance: `0x${ethLimit.toString(16)}`,
          unit: 'day' as const,
          multiplier: 2,  // 2 days period (2 * 1 day)
        }],
        calls: [{
          target: spenderAddress as Address,
          functionSignature: 'transfer(address,uint256)',
        }]
      };

      console.log('🔐 [App-Specific] Permission data:', JSON.stringify({
        expiryTimestamp,
        spenderAddress,
        permissions,
      }, null, 2));

      console.log('🔐 [App-Specific] Calling account.grantPermissions...');
      const result = await account.grantPermissions(
        expiryTimestamp,
        spenderAddress as `0x${string}`,
        permissions
      );

      console.log('✅ [App-Specific] Permission granted successfully!');
      console.log('✅ [App-Specific] Permission ID:', result.permissionId);
      console.log('✅ [App-Specific] Full result:', JSON.stringify(result, null, 2));

      setLastPermissionId(result.permissionId);
      Alert.alert(
        'Success',
        `Permission granted!\nID: ${result.permissionId.slice(0, 10)}...`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('❌ [App-Specific] Permission grant failed!');
      console.error('❌ [App-Specific] Error name:', error instanceof Error ? error.name : 'Unknown');
      console.error('❌ [App-Specific] Error message:', error instanceof Error ? error.message : String(error));
      console.error('❌ [App-Specific] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('❌ [App-Specific] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      if (error instanceof Error && error.name !== 'NotAllowedError') {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsGranting(false);
      console.log('🔐 [App-Specific] grantPermissions completed (isGranting set to false)');
    }
  };

  const handleRevokePermissions = async () => {
    if (!account || !connectedAddress || !lastPermissionId) {
      Alert.alert('Error', 'No permission to revoke');
      return;
    }

    console.log('🚫 [App-Specific] Starting revokePermission...');
    console.log('🚫 [App-Specific] Connected address:', connectedAddress);
    console.log('🚫 [App-Specific] Permission ID to revoke:', lastPermissionId);

    setIsRevoking(true);
    try {
      console.log('🚫 [App-Specific] Calling account.revokePermission...');
      await account.revokePermission(lastPermissionId as `0x${string}`);

      console.log('✅ [App-Specific] Permission revoked successfully!');
      Alert.alert('Success', 'Permission revoked successfully');
      setLastPermissionId(undefined);
    } catch (error) {
      console.error('❌ [App-Specific] Permission revoke failed!');
      console.error('❌ [App-Specific] Error name:', error instanceof Error ? error.name : 'Unknown');
      console.error('❌ [App-Specific] Error message:', error instanceof Error ? error.message : String(error));
      console.error('❌ [App-Specific] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('❌ [App-Specific] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      if (error instanceof Error && error.name !== 'NotAllowedError') {
        Alert.alert('Error', error.message);
      }
    } finally {
      setIsRevoking(false);
      console.log('🚫 [App-Specific] revokePermission completed (isRevoking set to false)');
    }
  };

  return (
    <View className="gap-4">
      {/* Connect Wallet Card */}
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

            {/* Warning about requirements */}
            <View className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-2">
              <Text className="text-xs text-yellow-800 dark:text-yellow-200 font-semibold mb-1">
                Development Build Required
              </Text>
              <Text className="text-xs text-yellow-800 dark:text-yellow-200">
                App-Specific passkeys require:{'\n'}
                {'\u2022'} Development build (npx expo run:ios/android){'\n'}
                {'\u2022'} iOS: AASA file with your Team ID on your domain{'\n'}
                {'\u2022'} Android: assetlinks.json configuration{'\n\n'}
                Use Cross-Platform mode for testing in Expo Go.
              </Text>
            </View>
          </>
        )}
        </CardContent>
      </Card>

      {/* Sign Message Card - Only show when connected */}
      {connectedAddress && account && (
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
            <Button onPress={handleOpenSignModal} disabled={!messageToSign}>
              Sign Message
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
      {connectedAddress && account && (
        <Card>
          <CardHeader>
            <CardTitle>Send Transaction</CardTitle>
            <CardDescription>
              Send a test transaction (0 ETH to self)
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Button onPress={handleOpenTxModal}>
              Send Test Transaction
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
              Uses native passkey for transaction signing
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Grant Permissions Card - Only show when connected */}
      {connectedAddress && account && (
        <Card>
          <CardHeader>
            <CardTitle>Grant Permissions</CardTitle>
            <CardDescription>
              Allow spending tokens and calling functions
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="p-3 bg-secondary rounded-lg">
              <Text className="text-xs font-bold text-foreground mb-1">
                This will grant:
              </Text>
              <Text className="text-xs text-muted-foreground">
                • 0.0001 ETH spending limit per 2 days
              </Text>
              <Text className="text-xs text-muted-foreground">
                • Permission to call transfer function
              </Text>
              <Text className="text-xs text-muted-foreground">
                • Valid for 30 days
              </Text>
            </View>
            <Button onPress={handleGrantPermissions} disabled={isGranting}>
              {isGranting ? 'Granting...' : 'Grant Permissions'}
            </Button>
            {lastPermissionId && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">Last Permission ID</Text>
                <Text className="text-foreground font-mono text-xs" numberOfLines={1}>
                  {lastPermissionId}
                </Text>
              </View>
            )}
            <Text className="text-xs text-muted-foreground text-center">
              Uses native passkey for permission approval
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Revoke Permissions Card - Only show when connected and has permission */}
      {connectedAddress && account && lastPermissionId && (
        <Card>
          <CardHeader>
            <CardTitle>Revoke Permissions</CardTitle>
            <CardDescription>
              Remove the granted permissions
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-4">
            <Button variant="destructive" onPress={handleRevokePermissions} disabled={isRevoking}>
              {isRevoking ? 'Revoking...' : 'Revoke Permissions'}
            </Button>
            <Text className="text-xs text-muted-foreground text-center">
              Uses native passkey for revoke confirmation
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Sign Message Modal */}
      <SignatureModal
        open={showSignModal}
        onOpenChange={setShowSignModal}
        message={messageToSign}
        origin="JAW Demo Native"
        timestamp={new Date()}
        accountAddress={connectedAddress || undefined}
        chainName="Ethereum"
        chainId={CHAIN_ID}
        onSign={handleSignMessage}
        onCancel={handleCancelSign}
        isProcessing={isSigning}
      />

      {/* Send Transaction Modal */}
      <TransactionModal
        open={showTxModal}
        onOpenChange={setShowTxModal}
        transactions={[testTransactionForModal]}
        walletAddress={connectedAddress || ''}
        gasFee={gasFee}
        gasFeeLoading={gasFeeLoading}
        sponsored={true}
        onConfirm={handleSendTransaction}
        onCancel={handleCancelTx}
        isProcessing={isSending}
        networkName="Ethereum"
        chainId={CHAIN_ID}
      />
    </View>
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
          <CrossPlatformContent />
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
                  Cross-Platform (Safari/Chrome) or App-Specific (native passkeys)
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
                  Test signing, transactions, and permission management
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
