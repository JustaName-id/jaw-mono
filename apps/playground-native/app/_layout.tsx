import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { ReactNativeUIHandler, JAWModalRoot } from '@jaw/ui-native';
import '../global.css';

export default function RootLayout() {
  // Create the UI handler instance
  const uiHandler = useMemo(() => new ReactNativeUIHandler(), []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#ffffff',
          },
          headerTintColor: '#18181B',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'JAW Demo' }} />
        <Stack.Screen name="components" options={{ title: 'UI Components' }} />
        <Stack.Screen name="connect" options={{ title: 'Connect Wallet' }} />
      </Stack>
      <JAWModalRoot />
    </>
  );
}
