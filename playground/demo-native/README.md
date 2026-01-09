# JAW Demo Native

React Native demo app showcasing JAW SDK integration with native passkeys.

## Two Authentication Modes

| Mode | Expo Go | Development Build | Setup Required |
|------|---------|-------------------|----------------|
| **Cross-Platform** | ✅ Works | ✅ Works | None |
| **App-Specific** | ❌ Fails | ✅ Works | AASA + Domain config |

**Cross-Platform**: Opens Safari/Chrome for authentication. Works everywhere, no setup needed.

**App-Specific**: Native passkeys via Face ID/Touch ID. Requires configuration below.

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your values

# For Cross-Platform mode (works in Expo Go)
npx expo start

# For App-Specific mode (requires development build)
npx expo prebuild --clean
npx expo run:ios --device
```

---

## Configuration for App-Specific Mode

### 1. Environment Variables (`.env`)

```bash
EXPO_PUBLIC_API_KEY=your-jaw-api-key
EXPO_PUBLIC_DEFAULT_CHAIN_ID=11155111
EXPO_PUBLIC_RP_ID=your-domain.com
EXPO_PUBLIC_RP_NAME=Your App Name
EXPO_PUBLIC_KEYS_URL=https://your-domain.com
```

### 2. iOS Associated Domains (`app.json`)

Update the `associatedDomains` array:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "your.bundle.id",
      "associatedDomains": [
        "webcredentials:your-domain.com"
      ]
    }
  }
}
```

### 3. Apple App Site Association (AASA) File

Host this JSON at `https://your-domain.com/.well-known/apple-app-site-association`:

```json
{
  "webcredentials": {
    "apps": [
      "TEAM_ID.your.bundle.id"
    ]
  }
}
```

**Required values:**
- `TEAM_ID`: Your Apple Developer Team ID (found in Apple Developer Portal → Membership)
- `your.bundle.id`: Must match `bundleIdentifier` in `app.json`

### 4. Android Asset Links (for Android)

Host this JSON at `https://your-domain.com/.well-known/assetlinks.json`:

```json
[{
  "relation": ["delegate_permission/common.get_login_creds"],
  "target": {
    "namespace": "android_app",
    "package_name": "your.package.name",
    "sha256_cert_fingerprints": ["YOUR_SHA256_FINGERPRINT"]
  }
}]
```

---

## Local Development with ngrok

For testing without deploying AASA to production:

```bash
# 1. Start your backend server (keys-jaw-id) locally
nx run @jaw-mono/keys-jaw-id:dev

# 2. Start ngrok tunnel
ngrok http 3000

# 3. Update .env with ngrok URL
EXPO_PUBLIC_RP_ID=abc123.ngrok-free.app
EXPO_PUBLIC_KEYS_URL=https://abc123.ngrok-free.app

# 4. Update app.json associatedDomains
"associatedDomains": ["webcredentials:abc123.ngrok-free.app"]

# 5. Rebuild the app (required when changing associatedDomains)
npx expo prebuild --clean
npx expo run:ios --device
```

> **Note:** ngrok URLs change each session. You must rebuild after each URL change.

---

## Troubleshooting

### Error: `NativePasskeyUnavailableError`
**Cause:** Running in Expo Go (native modules not available)
**Fix:** Use Cross-Platform mode, or create a development build with `npx expo prebuild && npx expo run:ios`

### Error: `Code=1004` or Associated Domains failure
**Cause:** AASA file not accessible or misconfigured
**Fix:**
1. Verify AASA is served at `https://your-domain/.well-known/apple-app-site-association`
2. Check Team ID matches your Apple Developer account
3. Check bundle ID matches exactly
4. Rebuild after any domain changes: `npx expo prebuild --clean`

### Error: `Property 'crypto' doesn't exist`
**Cause:** Crypto polyfill not loaded first
**Fix:** Ensure `index.js` has polyfill import at the top:
```javascript
import 'react-native-get-random-values';
// ... other imports after
```

### Error: `Cannot read property 'get' of undefined`
**Cause:** Navigator.credentials not available in React Native
**Fix:** This is handled automatically by passing `getFn` adapter. Ensure you're using the latest SDK version.

---

## Files Overview

| File | Purpose |
|------|---------|
| `.env` | Local environment variables (gitignored) |
| `.env.example` | Template for environment variables |
| `app.json` | Expo config including iOS associatedDomains |
| `app/connect.tsx` | Main demo screen with both auth modes |
| `index.js` | Entry point with crypto polyfills |

---

## Platform Requirements

- **iOS**: 15.0+ (for passkey support)
- **Android**: compileSdkVersion 34+ 
- **Physical device required** for passkey testing (simulators don't support passkeys)
