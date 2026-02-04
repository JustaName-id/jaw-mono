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

For testing App-Specific mode locally without deploying to production, follow these steps:

### Step-by-Step Setup

#### 1. Start the keys.jaw.id Backend

From the monorepo root:

```bash
cd /Users/anthonykhoury/repo/jaw-mono
bunx nx dev @jaw-mono/keys-jaw-id
```

The server should start on `http://localhost:3000`.

#### 2. Set up ngrok Tunnel

In a new terminal:

```bash
ngrok http 3000
```

You'll see output like:

```
Forwarding    https://7d6e58d21602.ngrok-free.app -> http://localhost:3000
```

**Copy the ngrok URL** (e.g., `7d6e58d21602.ngrok-free.app`). You'll need this for the next steps.

#### 3. Update Environment Variables

Edit `.env` in the demo-native directory:

```bash
EXPO_PUBLIC_API_KEY=A4hMduNBI1hi1I5bqlGM3mk0hclrPCeT
EXPO_PUBLIC_DEFAULT_CHAIN_ID=84532
EXPO_PUBLIC_RP_ID=7d6e58d21602.ngrok-free.app  # ⚠️ Use YOUR ngrok domain
EXPO_PUBLIC_RP_NAME=JAW Wallet
EXPO_PUBLIC_KEYS_URL=https://7d6e58d21602.ngrok-free.app  # ⚠️ Use YOUR ngrok domain
```

**Important:** Replace `7d6e58d21602.ngrok-free.app` with your actual ngrok domain from step 2.

#### 4. Update iOS Associated Domains

Edit `app.json` and update the `associatedDomains` array:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "id.jaw.demo.native",
      "developmentTeam": "9234ZPYS2R",
      "associatedDomains": [
        "webcredentials:7d6e58d21602.ngrok-free.app"  // ⚠️ Use YOUR ngrok domain
      ]
    }
  }
}
```

**Critical:** The domain here MUST match `EXPO_PUBLIC_RP_ID` in `.env` exactly.

#### 5. Clean and Rebuild the App

**This step is required every time you change the ngrok domain or associatedDomains.**

```bash
cd playground/demo-native

# Remove old native builds
rm -rf ios android

# Generate fresh native projects
npx expo prebuild

# Build and run on physical iOS device
npx expo run:ios --device
```

> **Why rebuild?** The `associatedDomains` entitlement is baked into the iOS build. Changing it in `app.json` requires regenerating the native project.

#### 6. Verify Setup

Before testing passkeys, verify your configuration:

**A. Check the association file is accessible:**

```bash
curl https://7d6e58d21602.ngrok-free.app/.well-known/apple-app-site-association
```

Expected response:

```json
{
  "webcredentials": {
    "apps": [
      "9234ZPYS2R.id.jaw.demo.native"
    ]
  }
}
```

**B. Verify domain consistency:**

```bash
# In demo-native directory
grep RP_ID .env
grep associatedDomains app.json
```

Both should show the same ngrok domain.

**C. Check iOS build date:**

```bash
ls -la ios/
```

The `ios/` directory should have been created/modified just now (after prebuild).

### Testing Passkeys

1. Open the app on your physical iOS device
2. Tap "App-Specific Mode"
3. Tap "Connect Wallet"
4. Create a passkey - Face ID/Touch ID prompt should appear
5. Sign in on subsequent launches

### ngrok Session Management

> **Note:** ngrok URLs change each session unless you have a paid account with reserved domains.

**When starting a new development session:**

1. Start keys.jaw.id backend
2. Start ngrok (you'll get a new URL)
3. Update `.env` with new ngrok domain
4. Update `app.json` with new ngrok domain
5. **Rebuild:** `rm -rf ios android && npx expo prebuild && npx expo run:ios --device`

**Tip:** Use ngrok's reserved domains feature (paid plan) to avoid rebuilding on every restart.

---

## Troubleshooting

### Error: `RequestFailed: No Credentials were returned`

**Symptoms:**
- Passkey creation fails silently
- Error object: `{ error: "RequestFailed", message: "The request failed. No Credentials were returned." }`

**Cause:** Domain mismatch between your `.env` configuration and the iOS build's entitlements file.

**Root Cause:**
This happens when:
1. You changed the ngrok domain in `.env` and `app.json`
2. But the iOS build is from before the change
3. The entitlements file inside the build still has the old domain
4. iOS rejects the passkey request because rpId doesn't match associated domains

**Fix:**
```bash
# 1. Verify domain consistency
grep RP_ID .env
grep associatedDomains app.json
# Both should show the SAME domain

# 2. Check if your iOS build is outdated
ls -la ios/
# If the date is before your last domain change, rebuild:

# 3. Clean rebuild
rm -rf ios android
npx expo prebuild
npx expo run:ios --device
```

**Prevention:**
- Always rebuild (`rm -rf ios android && npx expo prebuild`) after changing domains
- Use ngrok reserved domains (paid) to avoid frequent domain changes
- Check build date with `ls -la ios/` to ensure it's recent

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

### Passkey works in development but fails in production

**Cause:** Using ngrok domain in production build

**Fix:**
1. Deploy keys.jaw.id to a production domain (e.g., `keys.jaw.id`)
2. Update `.env` and `app.json` to use production domain
3. Ensure AASA file is served at production domain
4. Rebuild app with production configuration
5. Submit to App Store

### Debugging Tips

**Enable verbose error logging:**

```typescript
try {
  await jaw.connect({ mode: 'app-specific' });
} catch (error) {
  console.error('Error details:', JSON.stringify(error, null, 2));
  console.error('Error keys:', Object.keys(error as object));
  console.error('Error type:', typeof error);
}
```

**Check association file:**

```bash
# Replace with your domain
curl https://your-domain.ngrok-free.app/.well-known/apple-app-site-association

# Should return JSON with your Team ID and bundle identifier
```

**Verify entitlements (after building):**

```bash
cd ios/
grep -r "associated-domains" .
```

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
