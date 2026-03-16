import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        <View className="bg-card border border-border rounded-xl p-4">
          <Text className="text-xl font-bold text-foreground mb-1">JAW Native Demo</Text>
          <Text className="text-sm text-muted-foreground mb-4">
            Test the JAW React Native SDK with cross-platform authentication
          </Text>

          <Link href="/connect" asChild>
            <TouchableOpacity className="bg-primary rounded-lg py-3 px-4 items-center">
              <Text className="text-primary-foreground font-medium">Connect & Test Wallet</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View className="bg-card border border-border rounded-xl p-4">
          <Text className="text-lg font-bold text-foreground mb-1">About</Text>
          <Text className="text-muted-foreground text-sm">
            This demo app uses @jaw.id/core with MobileCommunicationAdapter
            for cross-platform authentication via Safari View Controller (iOS)
            or Chrome Custom Tab (Android). Full WebAuthn/passkey support.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
