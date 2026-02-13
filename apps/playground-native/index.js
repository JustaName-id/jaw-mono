// Crypto polyfills must be imported first (before any viem/ox code)
import 'react-native-get-random-values';

// Polyfill crypto.subtle for WebAuthn/passkey operations (required by ox/viem)
// react-native-quick-crypto provides SubtleCrypto implementation
import { install } from 'react-native-quick-crypto';

// Install the quick-crypto polyfill
install();

// Polyfill crypto.randomUUID (not included in react-native-get-random-values)
// This is required for @jaw.id/core which uses crypto.randomUUID() extensively
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = function() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  };
}

// Entry point for Expo Router
import "expo-router/entry";
