"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type DeviceState =
  | "enter-code"
  | "loading"
  | "popup-open"
  | "success"
  | "error";

// ============================================================================
// Crypto helpers (mirrors @jaw.id/core's ECDH P-256 protocol)
// ============================================================================

async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
}

async function exportKeyToHex(
  type: "public" | "private",
  key: CryptoKey,
): Promise<string> {
  const format = type === "private" ? "pkcs8" : "spki";
  const exported = await crypto.subtle.exportKey(format, key);
  return Array.from(new Uint8Array(exported))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importKeyFromHex(
  type: "public" | "private",
  hex: string,
): Promise<CryptoKey> {
  const format = type === "private" ? "pkcs8" : "spki";
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return crypto.subtle.importKey(
    format,
    bytes,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    type === "private" ? ["deriveKey"] : [],
  );
}

async function deriveSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decryptAESGCM(
  sharedSecret: CryptoKey,
  encrypted: { iv: BufferSource; cipherText: ArrayBuffer },
): Promise<unknown> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encrypted.iv },
    sharedSecret,
    encrypted.cipherText,
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// ============================================================================
// Device Flow Component
// ============================================================================

function CLIDeviceContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<DeviceState>("enter-code");
  const [userCode, setUserCode] = useState(searchParams.get("code") ?? "");
  const [error, setError] = useState("");
  const popupRef = useRef<Window | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = userCode.trim().toUpperCase();
    if (!trimmed || trimmed.length < 9) {
      setError("Please enter a valid code (e.g., ABCD-1234)");
      return;
    }

    setState("loading");
    setError("");

    try {
      // Find the device code entry by user code
      const res = await fetch(
        `/api/cli/device/lookup?userCode=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) {
        setState("error");
        setError("Invalid or expired code. Please try again.");
        return;
      }

      const { deviceCode, method, params, submitToken, apiKey } =
        (await res.json()) as {
          deviceCode: string;
          method: string;
          params: unknown;
          submitToken: string;
          apiKey?: string;
        };

      // Generate ECDH key pair for encrypted communication with popup
      const keyPair = await generateECDHKeyPair();
      const ownPublicKeyHex = await exportKeyToHex("public", keyPair.publicKey);

      // Open the popup for passkey auth (triggered by form submit = user gesture)
      const popup = window.open(
        window.location.origin,
        `jaw_device_${deviceCode}`,
        "width=420,height=730,left=200,top=100",
      );

      if (!popup) {
        setState("error");
        setError("Failed to open popup. Please allow popups and try again.");
        return;
      }

      popupRef.current = popup;
      setState("popup-open");

      // Wait for popup result using ECDH-encrypted protocol
      const result = await runPopupProtocol(
        popup,
        method,
        params,
        ownPublicKeyHex,
        keyPair.privateKey,
        apiKey,
      );

      // Submit result to poll endpoint (submitToken required for auth)
      await fetch("/api/cli/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceCode,
          submitToken,
          success: true,
          result,
        }),
      });

      setState("success");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
        <h1 style={styles.title}>JAW CLI Device Login</h1>

        {state === "enter-code" && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <p style={styles.text}>
              Enter the code shown in your terminal to authenticate.
            </p>
            <input
              type="text"
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              style={styles.input}
              autoFocus
              maxLength={9}
            />
            {error && <p style={styles.errorText}>{error}</p>}
            <button type="submit" style={styles.button}>
              Continue
            </button>
          </form>
        )}

        {state === "loading" && <p style={styles.text}>Verifying code...</p>}

        {state === "popup-open" && (
          <>
            <p style={styles.text}>
              Complete authentication in the popup window.
            </p>
            <p style={styles.subtext}>
              Sign with your passkey, then this page will confirm to your
              terminal.
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <p style={styles.success}>Authenticated!</p>
            <p style={styles.subtext}>
              You can close this page. Your terminal session is now connected.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <p style={styles.errorLabel}>Error</p>
            <p style={styles.subtext}>{error}</p>
            <button
              onClick={() => {
                setState("enter-code");
                setError("");
              }}
              style={styles.button}
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CLIDevicePage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={{ color: "#555" }}>Loading...</p>
          </div>
        </div>
      }
    >
      <CLIDeviceContent />
    </Suspense>
  );
}

// ============================================================================
// Popup Protocol (ECDH handshake + encrypted response)
// ============================================================================

const JAW_RPC_URL = "https://api.justaname.id/proxy/v1/rpc";

async function runPopupProtocol(
  popup: Window,
  method: string,
  params: unknown,
  ownPublicKeyHex: string,
  ownPrivateKey: CryptoKey,
  apiKey?: string,
): Promise<unknown> {
  const origin = window.location.origin;
  const TIMEOUT_MS = 120_000;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Popup timed out after 120 seconds"));
    }, TIMEOUT_MS);

    const popupCheck = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Popup was closed before completing"));
      }
    }, 500);

    function cleanup() {
      clearTimeout(timeout);
      clearInterval(popupCheck);
      window.removeEventListener("message", handler);
    }

    let phase: "waiting-loaded" | "waiting-ready" | "waiting-handshake" =
      "waiting-loaded";

    function handler(event: MessageEvent) {
      if (event.origin !== origin) return;
      const msg = event.data;

      switch (phase) {
        case "waiting-loaded": {
          if (msg?.event === "PopupLoaded") {
            popup.postMessage(
              {
                requestId: msg.id,
                data: {
                  version: "1.0.0",
                  metadata: { appName: "JAW CLI", appLogoUrl: "" },
                  preference: { mode: "crossPlatform" },
                  location: window.location.toString(),
                  apiKey: apiKey ?? undefined,
                },
              },
              origin,
            );
            phase = "waiting-ready";
          }
          break;
        }

        case "waiting-ready": {
          if (msg?.event === "PopupReady") {
            const chainId = 1;
            const rpcUrl = apiKey
              ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`
              : undefined;

            popup.postMessage(
              {
                id: crypto.randomUUID(),
                sender: ownPublicKeyHex,
                content: {
                  handshake: { method, params: params ?? [] },
                  chain: { id: chainId, rpcUrl },
                },
                timestamp: new Date(),
              },
              origin,
            );
            phase = "waiting-handshake";
          }
          break;
        }

        case "waiting-handshake": {
          if (msg?.requestId || msg?.content) {
            if (msg?.content?.failure) {
              cleanup();
              reject(
                new Error(msg.content.failure.message || "Request failed"),
              );
              return;
            }

            if (msg?.content?.encrypted) {
              const peerPublicKeyHex = msg.sender as string;
              decryptPopupResponse(
                ownPrivateKey,
                peerPublicKeyHex,
                msg.content.encrypted,
              )
                .then((decrypted) => {
                  cleanup();
                  resolve(decrypted);
                })
                .catch((err) => {
                  cleanup();
                  reject(err);
                });
              return;
            }

            cleanup();
            resolve(msg.content || msg.data || msg);
          }
          break;
        }
      }

      if (msg?.event === "PopupUnload") {
        cleanup();
        reject(new Error("Popup closed unexpectedly"));
      }
    }

    window.addEventListener("message", handler);
  });
}

async function decryptPopupResponse(
  ownPrivateKey: CryptoKey,
  peerPublicKeyHex: string,
  encrypted: { iv: BufferSource; cipherText: ArrayBuffer },
): Promise<unknown> {
  const peerPublicKey = await importKeyFromHex("public", peerPublicKeyHex);
  const sharedSecret = await deriveSecret(ownPrivateKey, peerPublicKey);
  const decrypted = (await decryptAESGCM(sharedSecret, encrypted)) as {
    result?: { value?: unknown; error?: { code: number; message: string } };
  };

  if (decrypted?.result?.error) {
    throw new Error(
      `[${decrypted.result.error.code}] ${decrypted.result.error.message}`,
    );
  }

  return decrypted?.result?.value ?? decrypted;
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    textAlign: "center",
    padding: "3rem",
    maxWidth: "420px",
  },
  logo: {
    width: "48px",
    height: "48px",
    marginBottom: "1rem",
    opacity: 0.8,
  },
  title: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "1rem",
    color: "#111",
  },
  text: {
    color: "#555",
    fontSize: "0.95rem",
    lineHeight: 1.5,
    marginBottom: "1rem",
  },
  subtext: {
    color: "#888",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    marginTop: "0.5rem",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
    alignItems: "center",
  },
  input: {
    fontSize: "1.5rem",
    fontFamily: "monospace",
    textAlign: "center" as const,
    letterSpacing: "0.15em",
    padding: "0.75rem 1rem",
    border: "2px solid #ddd",
    borderRadius: "8px",
    width: "200px",
    outline: "none",
  },
  button: {
    padding: "0.75rem 2rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    backgroundColor: "#111",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  success: {
    color: "#16a34a",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  errorLabel: {
    color: "#dc2626",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  errorText: {
    color: "#dc2626",
    fontSize: "0.85rem",
  },
};
