import { View, Text, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@jaw/ui-native';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>JAW Native Demo</CardTitle>
            <CardDescription>
              Test the JAW React Native UI components and wallet functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Link href="/components" asChild>
              <Button>
                <Text className="text-primary-foreground font-medium">UI Components</Text>
              </Button>
            </Link>

            <Link href="/connect" asChild>
              <Button variant="outline">
                <Text className="text-foreground font-medium">Connect & Test Wallet</Text>
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-muted-foreground text-sm">
              This demo app showcases the @jaw/ui-native package components
              and integrates with @jaw.id/core for wallet functionality including
              signing, transactions, and permissions.
            </Text>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
