import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { MobileCommunicationAdapter } from "@jaw/ui-native";
import { JAW, Mode } from "@jaw.id/core";
import { parseEther } from "viem";

// Configuration from environment variables
const CHAIN_ID = parseInt(process.env.EXPO_PUBLIC_DEFAULT_CHAIN_ID || "1", 10);
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || "";
const KEYS_URL = process.env.EXPO_PUBLIC_KEYS_URL || "https://keys.jaw.id";

export default function ConnectScreen() {
  // SDK state
  const [sdk, setSdk] = useState<ReturnType<typeof JAW.create> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Operation states
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messageToSign, setMessageToSign] = useState("Hello from JAW Native!");
  const [signature, setSignature] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Permissions state
  const [lastPermissionId, setLastPermissionId] = useState<string>();
  const [isGranting, setIsGranting] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);

  // Initialize SDK on mount
  useEffect(() => {
    const jawSdk = JAW.create({
      apiKey: API_KEY,
      appName: "JAW Demo Native",
      defaultChainId: CHAIN_ID,
      preference: {
        mode: Mode.CrossPlatform,
        communicationAdapter: new MobileCommunicationAdapter(),
        keysUrl: KEYS_URL,
        showTestnets: true,
      },
    });

    // Listen to provider events
    jawSdk.provider.on("accountsChanged", (accounts: string[]) => {
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
      } else {
        setAddress(null);
        setUsername(null);
        setIsConnected(false);
      }
    });

    jawSdk.provider.on("disconnect", () => {
      setIsConnected(false);
      setAddress(null);
      setUsername(null);
    });

    jawSdk.provider.on("connect", () => {
      setIsConnected(true);
    });

    setSdk(jawSdk);

    return () => {
      jawSdk.disconnect();
    };
  }, []);

  const handleConnect = async () => {
    if (!sdk) {
      Alert.alert("Error", "SDK not initialized");
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = (await sdk.provider.request({
        method: "eth_requestAccounts",
        params: [],
      })) as string[];

      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        setUsername("user");
      }
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to connect",
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignMessage = async () => {
    if (!sdk || !address) {
      Alert.alert("Error", "Please connect your wallet first");
      return;
    }

    setIsSigning(true);
    setSignature(null);
    try {
      const sig = (await sdk.provider.request({
        method: "personal_sign",
        params: [messageToSign, address],
      })) as string;

      setSignature(sig);
      Alert.alert("Success", "Message signed successfully!");
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to sign message",
      );
    } finally {
      setIsSigning(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!sdk || !address) {
      Alert.alert("Error", "Please connect your wallet first");
      return;
    }

    setIsSending(true);
    setTxHash(null);
    try {
      const result = (await sdk.provider.request({
        method: "wallet_sendCalls",
        params: [
          {
            version: "1.0",
            chainId: `0x${CHAIN_ID.toString(16)}`,
            from: address,
            calls: [
              {
                to: address, // Send to self for testing
                value: "0x0",
                data: "0x",
              },
            ],
          },
        ],
      })) as string;

      setTxHash(result);
      Alert.alert(
        "Success",
        `Transaction sent!\n\nHash: ${result.slice(0, 20)}...`,
      );
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to send transaction",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleGrantPermissions = async () => {
    if (!sdk || !address) {
      Alert.alert("Error", "Please connect your wallet first");
      return;
    }

    setIsGranting(true);
    try {
      const spenderAddress = "0x23d3957be879aba6ca925ee4f072d1a8c4e8c890";
      const ethLimit = parseEther("0.0001");
      const expiryTimestamp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const result = (await sdk.provider.request({
        method: "wallet_grantPermissions",
        params: [
          {
            expiry: expiryTimestamp,
            signer: {
              type: "account",
              data: { id: address },
            },
            permissions: [
              {
                type: "native-token-recurring-allowance",
                data: {
                  allowance: `0x${ethLimit.toString(16)}`,
                  start: Math.floor(Date.now() / 1000),
                  period: 2 * 24 * 60 * 60,
                  spender: spenderAddress,
                },
                required: true,
              },
            ],
            chainId: `0x${CHAIN_ID.toString(16)}`,
          },
        ],
      })) as {
        permissionId?: string;
        grantedPermissions?: { context: string }[];
      };

      const permissionId =
        result?.permissionId || result?.grantedPermissions?.[0]?.context;

      if (permissionId) {
        setLastPermissionId(permissionId);
        Alert.alert(
          "Success",
          `Permission granted!\nID: ${permissionId.slice(0, 10)}...`,
        );
      } else {
        Alert.alert("Error", "Failed to grant permissions");
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Error", error.message);
      }
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevokePermissions = async () => {
    if (!sdk || !address || !lastPermissionId) {
      Alert.alert("Error", "No permission to revoke");
      return;
    }

    setIsRevoking(true);
    try {
      await sdk.provider.request({
        method: "wallet_revokePermissions",
        params: [{ id: lastPermissionId }],
      });

      Alert.alert("Success", "Permission revoked successfully");
      setLastPermissionId(undefined);
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Error", error.message);
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!sdk) return;

    try {
      await sdk.provider.request({
        method: "wallet_disconnect",
        params: [],
      });

      setIsConnected(false);
      setAddress(null);
      setUsername(null);
      setSignature(null);
      setTxHash(null);
      setLastPermissionId(undefined);
    } catch (error) {
      setIsConnected(false);
      setAddress(null);
      setUsername(null);
      setSignature(null);
      setTxHash(null);
      setLastPermissionId(undefined);
    }
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        {/* Mode Info */}
        <View className="bg-card border border-border rounded-xl p-4">
          <Text className="text-lg font-bold text-foreground mb-1">
            Cross-Platform Mode
          </Text>
          <Text className="text-sm text-muted-foreground">
            Opens Safari View Controller (iOS) / Chrome Custom Tab (Android) to
            keys.jaw.id for secure passkey authentication. Full WebAuthn
            support.
          </Text>
        </View>

        {/* Connect Card */}
        <View className="bg-card border border-border rounded-xl p-4 gap-4">
          <Text className="text-lg font-bold text-foreground">
            Connect Wallet
          </Text>
          <Text className="text-sm text-muted-foreground">
            Authenticate via Safari View Controller
          </Text>

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
              <TouchableOpacity
                className="border border-border rounded-lg py-3 px-4 items-center"
                onPress={handleDisconnect}
              >
                <Text className="text-foreground font-medium">Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="gap-4">
              <TouchableOpacity
                className="bg-primary rounded-lg py-3 px-4 items-center"
                onPress={handleConnect}
                disabled={isConnecting}
              >
                <Text className="text-primary-foreground font-medium">
                  {isConnecting ? "Connecting..." : "Connect with JAW"}
                </Text>
              </TouchableOpacity>
              <Text className="text-xs text-muted-foreground text-center">
                Opens keys.jaw.id in Safari for secure passkey authentication
              </Text>
            </View>
          )}
        </View>

        {/* Sign Message Card */}
        {isConnected && (
          <View className="bg-card border border-border rounded-xl p-4 gap-4">
            <Text className="text-lg font-bold text-foreground">
              Sign Message
            </Text>
            <Text className="text-sm text-muted-foreground">
              Sign a message with your passkey
            </Text>
            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                Message
              </Text>
              <TextInput
                className="border border-input rounded-lg px-3 py-2 text-foreground"
                value={messageToSign}
                onChangeText={setMessageToSign}
                placeholder="Enter message to sign"
                multiline
              />
            </View>
            <TouchableOpacity
              className="bg-primary rounded-lg py-3 px-4 items-center"
              onPress={handleSignMessage}
              disabled={isSigning || !messageToSign}
            >
              <Text className="text-primary-foreground font-medium">
                {isSigning ? "Signing..." : "Sign Message"}
              </Text>
            </TouchableOpacity>
            {signature && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">
                  Signature
                </Text>
                <Text
                  className="text-foreground font-mono text-xs"
                  numberOfLines={3}
                >
                  {signature}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Send Transaction Card */}
        {isConnected && (
          <View className="bg-card border border-border rounded-xl p-4 gap-4">
            <Text className="text-lg font-bold text-foreground">
              Send Transaction
            </Text>
            <Text className="text-sm text-muted-foreground">
              Send a test transaction (0 ETH to self)
            </Text>
            <TouchableOpacity
              className="bg-primary rounded-lg py-3 px-4 items-center"
              onPress={handleSendTransaction}
              disabled={isSending}
            >
              <Text className="text-primary-foreground font-medium">
                {isSending ? "Sending..." : "Send Test Transaction"}
              </Text>
            </TouchableOpacity>
            {txHash && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">
                  Transaction Hash
                </Text>
                <Text
                  className="text-foreground font-mono text-xs"
                  numberOfLines={2}
                >
                  {txHash}
                </Text>
              </View>
            )}
            <Text className="text-xs text-muted-foreground text-center">
              This will open Safari to confirm the transaction
            </Text>
          </View>
        )}

        {/* Grant Permissions Card */}
        {isConnected && (
          <View className="bg-card border border-border rounded-xl p-4 gap-4">
            <Text className="text-lg font-bold text-foreground">
              Grant Permissions
            </Text>
            <Text className="text-sm text-muted-foreground">
              Allow spending tokens and calling functions
            </Text>
            <View className="p-3 bg-secondary rounded-lg">
              <Text className="text-xs font-bold text-foreground mb-1">
                This will grant:
              </Text>
              <Text className="text-xs text-muted-foreground">
                - 0.0001 ETH spending limit per 2 days
              </Text>
              <Text className="text-xs text-muted-foreground">
                - Permission to call transfer function
              </Text>
              <Text className="text-xs text-muted-foreground">
                - Valid for 30 days
              </Text>
            </View>
            <TouchableOpacity
              className="bg-primary rounded-lg py-3 px-4 items-center"
              onPress={handleGrantPermissions}
              disabled={isGranting}
            >
              <Text className="text-primary-foreground font-medium">
                {isGranting ? "Granting..." : "Grant Permissions"}
              </Text>
            </TouchableOpacity>
            {lastPermissionId && (
              <View className="p-3 bg-secondary rounded-lg">
                <Text className="text-xs text-muted-foreground mb-1">
                  Last Permission ID
                </Text>
                <Text
                  className="text-foreground font-mono text-xs"
                  numberOfLines={1}
                >
                  {lastPermissionId}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Revoke Permissions Card */}
        {isConnected && lastPermissionId && (
          <View className="bg-card border border-border rounded-xl p-4 gap-4">
            <Text className="text-lg font-bold text-foreground">
              Revoke Permissions
            </Text>
            <Text className="text-sm text-muted-foreground">
              Remove the granted permissions
            </Text>
            <TouchableOpacity
              className="bg-destructive rounded-lg py-3 px-4 items-center"
              onPress={handleRevokePermissions}
              disabled={isRevoking}
            >
              <Text className="text-destructive-foreground font-medium">
                {isRevoking ? "Revoking..." : "Revoke Permissions"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works */}
        <View className="bg-card border border-border rounded-xl p-4 gap-3">
          <Text className="text-lg font-bold text-foreground">
            How it works
          </Text>
          <View className="flex-row gap-3">
            <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
              <Text className="text-primary-foreground text-xs font-bold">
                1
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-medium">Tap Connect</Text>
              <Text className="text-muted-foreground text-sm">
                Opens keys.jaw.id in Safari View Controller
              </Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
              <Text className="text-primary-foreground text-xs font-bold">
                2
              </Text>
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
              <Text className="text-primary-foreground text-xs font-bold">
                3
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-foreground font-medium">Ready to Use</Text>
              <Text className="text-muted-foreground text-sm">
                Test signing, transactions, and permission management
              </Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
