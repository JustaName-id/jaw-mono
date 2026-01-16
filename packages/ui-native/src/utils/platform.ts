/**
 * Platform Detection Utilities for React Native
 *
 * Helpers to detect the runtime environment and feature availability
 */

import { Platform } from 'react-native';

/**
 * Check if running in Expo Go
 *
 * Expo Go cannot run native modules like react-native-passkey,
 * so native passkeys require a development build.
 *
 * @returns true if running in Expo Go, false otherwise
 */
export function isExpoGo(): boolean {
  try {
    // expo-constants provides appOwnership which tells us the runtime
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo';
  } catch {
    // If expo-constants isn't available, we're not in Expo Go
    return false;
  }
}

/**
 * Check if native passkeys can be used in the current environment
 *
 * Native passkeys require:
 * - A development build (not Expo Go)
 * - iOS 15+ or Android API 28+
 * - Proper domain association (AASA for iOS, assetlinks for Android)
 *
 * @returns true if native passkeys might work, false if definitely won't
 */
export function canUseNativePasskeys(): boolean {
  // Can't use native passkeys in Expo Go
  if (isExpoGo()) {
    return false;
  }

  // Only iOS and Android support passkeys
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }

  // Check minimum OS versions
  if (Platform.OS === 'ios') {
    const majorVersion = parseInt(Platform.Version as string, 10);
    if (majorVersion < 15) {
      return false;
    }
  }

  if (Platform.OS === 'android' && typeof Platform.Version === 'number') {
    // API level 28 is Android 9.0, but passkeys work better on API 34+
    if (Platform.Version < 28) {
      return false;
    }
  }

  return true;
}

/**
 * Get a user-friendly message about why native passkeys aren't available
 *
 * @returns A message explaining why passkeys won't work, or null if they should work
 */
export function getNativePasskeyUnavailableReason(): string | null {
  if (isExpoGo()) {
    return 'Native passkeys require a development build. Please use Cross-Platform mode in Expo Go, or run: npx expo prebuild && npx expo run:ios/android';
  }

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return 'Native passkeys are only supported on iOS and Android';
  }

  if (Platform.OS === 'ios') {
    const majorVersion = parseInt(Platform.Version as string, 10);
    if (majorVersion < 15) {
      return 'Native passkeys require iOS 15 or later';
    }
  }

  if (Platform.OS === 'android' && typeof Platform.Version === 'number') {
    if (Platform.Version < 28) {
      return 'Native passkeys require Android 9.0 (API 28) or later';
    }
  }

  return null;
}
