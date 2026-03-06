"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, Suspense, useCallback } from "react";

/**
 * CLI Bridge Page
 *
 * Acts as a middleman between CLI and keys.jaw.id popup:
 * 1. CLI opens this page in the browser with callback URL + RPC request
 * 2. User clicks "Continue" button (user gesture required for popup)
 * 3. This page opens keys.jaw.id as a popup (standard postMessage flow)
 * 4. Popup handles passkey auth + signing (encrypted ECDH protocol)
 * 5. This page decrypts the response and POSTs result to CLI's localhost callback
 *
 * Two flows:
 * - Connect (wallet_connect, eth_requestAccounts): single handshake
 * - Signing (personal_sign, etc.): handshake for key exchange, then encrypted request
 */

type BridgeState =
  | "ready"
  | "popup-open"
  | "sending-callback"
  | "success"
  | "error";

const CONNECT_METHODS = ["wallet_connect", "eth_requestAccounts"];
const JAW_RPC_URL = "https://api.justaname.id/proxy/v1/rpc";

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

async function encryptAESGCM(
  sharedSecret: CryptoKey,
  data: unknown,
): Promise<{ iv: Uint8Array; cipherText: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const cipherText = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedSecret,
    plaintext,
  );
  return { iv, cipherText };
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

function parseDecryptedResult(decrypted: unknown): unknown {
  const d = decrypted as {
    result?: { value?: unknown; error?: { code: number; message: string } };
  };
  if (d?.result?.error) {
    throw new Error(`[${d.result.error.code}] ${d.result.error.message}`);
  }
  return d?.result?.value ?? decrypted;
}

// ============================================================================
// Bridge Component
// ============================================================================

function CLIBridgeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BridgeState>("ready");
  const [error, setError] = useState<string>("");
  const popupRef = useRef<Window | null>(null);

  const callbackUrl = searchParams.get("callback");
  const requestId = searchParams.get("requestId");
  const method = searchParams.get("method");
  const paramsRaw = searchParams.get("params");

  // API key is in the URL fragment (hash) to avoid browser history/server logs
  const [apiKey, setApiKey] = useState<string | null>(null);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    setApiKey(hashParams.get("apiKey"));
  }, []);

  // Validate params on mount
  const validationError =
    !callbackUrl || !requestId || !method
      ? "Missing required parameters: callback, requestId, method"
      : (() => {
          try {
            const cbUrl = new URL(callbackUrl);
            if (
              cbUrl.hostname !== "127.0.0.1" &&
              cbUrl.hostname !== "localhost"
            ) {
              return "Callback URL must be localhost (127.0.0.1)";
            }
          } catch {
            return "Invalid callback URL";
          }
          return null;
        })();

  const startBridgeFlow = useCallback(async () => {
    if (validationError || !callbackUrl || !requestId || !method) return;

    try {
      // 1. Generate ECDH key pair for this session
      const keyPair = await generateECDHKeyPair();
      const ownPublicKeyHex = await exportKeyToHex("public", keyPair.publicKey);

      // 2. Open keys.jaw.id as popup (triggered by user click — no blocker)
      const popup = window.open(
        window.location.origin,
        `jaw_cli_${requestId}`,
        "width=420,height=730,left=200,top=100",
      );

      if (!popup) {
        setState("error");
        setError(
          "Failed to open popup. Please allow popups for this site and try again.",
        );
        return;
      }

      popupRef.current = popup;
      setState("popup-open");

      // 3. Run the postMessage protocol with proper ECDH keys
      const params = paramsRaw ? JSON.parse(paramsRaw) : undefined;
      const isConnect = CONNECT_METHODS.includes(method);

      const result = isConnect
        ? await runConnectProtocol(
            popup,
            method,
            params,
            ownPublicKeyHex,
            keyPair.privateKey,
            apiKey,
          )
        : await runSigningProtocol(
            popup,
            method,
            params,
            ownPublicKeyHex,
            keyPair.privateKey,
            apiKey,
          );

      setState("sending-callback");

      // 4. POST result to CLI callback
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, success: true, data: result }),
      });

      setState("success");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // Try to send error to CLI
      if (callbackUrl && requestId) {
        try {
          await fetch(callbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId,
              success: false,
              error: { code: -32000, message: errMsg },
            }),
          });
        } catch {
          // CLI callback may have timed out
        }
      }

      setState("error");
      setError(errMsg);
    }
  }, [validationError, callbackUrl, requestId, method, paramsRaw, apiKey]);

  if (validationError) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
          <h1 style={styles.title}>JAW CLI Bridge</h1>
          <p style={styles.error}>Error</p>
          <p style={styles.subtext}>{validationError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
        <h1 style={styles.title}>JAW CLI Bridge</h1>

        {state === "ready" && (
          <>
            <p style={styles.text}>
              Your terminal is requesting <strong>{method}</strong>.
            </p>
            <button onClick={startBridgeFlow} style={styles.button}>
              Continue
            </button>
            {apiKey && (
              <p style={styles.subtext}>
                Authenticated with API key {apiKey.slice(0, 8)}...
              </p>
            )}
          </>
        )}

        {state === "popup-open" && (
          <>
            <p style={styles.text}>Complete the action in the popup window.</p>
            <p style={styles.subtext}>
              Sign with your passkey, then this page will automatically send the
              result back to your terminal.
            </p>
          </>
        )}

        {state === "sending-callback" && (
          <p style={styles.text}>Sending result to CLI...</p>
        )}

        {state === "success" && (
          <>
            <p style={styles.success}>Success!</p>
            <p style={styles.subtext}>
              You can close this tab and return to your terminal.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <p style={styles.error}>Error</p>
            <p style={styles.subtext}>{error}</p>
            <button
              onClick={() => {
                setState("ready");
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

export default function CLIBridgePage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={styles.text}>Loading...</p>
          </div>
        </div>
      }
    >
      <CLIBridgeContent />
    </Suspense>
  );
}

// ============================================================================
// Shared: wait for popup loaded + ready, return message handler helpers
// ============================================================================

interface PopupContext {
  popup: Window;
  origin: string;
  ownPublicKeyHex: string;
  ownPrivateKey: CryptoKey;
  apiKey: string | null;
  cleanup: () => void;
  reject: (err: Error) => void;
}

function buildChain(apiKey: string | null) {
  const chainId = 1;
  const rpcUrl = apiKey
    ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`
    : undefined;
  return { id: chainId, rpcUrl };
}

/**
 * Waits for popup to be loaded and ready, then returns a helper to listen
 * for the next message matching a predicate.
 */
function setupPopup(
  popup: Window,
  ownPublicKeyHex: string,
  ownPrivateKey: CryptoKey,
  apiKey: string | null,
): Promise<PopupContext> {
  const origin = window.location.origin;
  const TIMEOUT_MS = 120_000;

  return new Promise((resolveSetup, rejectSetup) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectSetup(new Error("Popup timed out after 120 seconds"));
    }, TIMEOUT_MS);

    const popupCheck = setInterval(() => {
      if (popup.closed) {
        cleanup();
        rejectSetup(
          new Error("Popup was closed before completing the action"),
        );
      }
    }, 500);

    function cleanup() {
      clearTimeout(timeout);
      clearInterval(popupCheck);
      window.removeEventListener("message", handler);
    }

    let phase: "waiting-loaded" | "waiting-ready" = "waiting-loaded";

    function handler(event: MessageEvent) {
      if (event.origin !== origin) return;
      const msg = event.data;

      if (phase === "waiting-loaded" && msg?.event === "PopupLoaded") {
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
        return;
      }

      if (phase === "waiting-ready" && msg?.event === "PopupReady") {
        // Remove this setup handler — callers will add their own
        window.removeEventListener("message", handler);
        resolveSetup({
          popup,
          origin,
          ownPublicKeyHex,
          ownPrivateKey,
          apiKey,
          cleanup,
          reject: (err: Error) => {
            cleanup();
            rejectSetup(err);
          },
        });
        return;
      }

      if (msg?.event === "PopupUnload") {
        cleanup();
        rejectSetup(new Error("Popup closed unexpectedly"));
      }
    }

    window.addEventListener("message", handler);
  });
}

// ============================================================================
// Connect flow: handshake with wallet_connect → encrypted response
// ============================================================================

async function runConnectProtocol(
  popup: Window,
  method: string,
  params: unknown,
  ownPublicKeyHex: string,
  ownPrivateKey: CryptoKey,
  apiKey: string | null,
): Promise<unknown> {
  const ctx = await setupPopup(popup, ownPublicKeyHex, ownPrivateKey, apiKey);

  return new Promise((resolve, reject) => {
    function handler(event: MessageEvent) {
      if (event.origin !== ctx.origin) return;
      const msg = event.data;

      if (msg?.event === "PopupUnload") {
        ctx.cleanup();
        window.removeEventListener("message", handler);
        reject(new Error("Popup closed unexpectedly"));
        return;
      }

      if (msg?.requestId || msg?.content) {
        if (msg?.content?.failure) {
          ctx.cleanup();
          window.removeEventListener("message", handler);
          reject(
            new Error(msg.content.failure.message || "Request failed in popup"),
          );
          return;
        }

        if (msg?.content?.encrypted) {
          ctx.cleanup();
          window.removeEventListener("message", handler);
          decryptResponse(ownPrivateKey, msg.sender, msg.content.encrypted)
            .then(resolve)
            .catch(reject);
          return;
        }

        // Fallback: unencrypted
        ctx.cleanup();
        window.removeEventListener("message", handler);
        resolve(msg.content || msg.data || msg);
      }
    }

    window.addEventListener("message", handler);

    // Send handshake with the actual method (wallet_connect)
    popup.postMessage(
      {
        id: crypto.randomUUID(),
        sender: ownPublicKeyHex,
        content: {
          handshake: { method, params: params ?? [] },
          chain: buildChain(apiKey),
        },
        timestamp: new Date(),
      },
      ctx.origin,
    );
  });
}

// ============================================================================
// Signing flow: handshake for key exchange → encrypted signing request
// ============================================================================

async function runSigningProtocol(
  popup: Window,
  method: string,
  params: unknown,
  ownPublicKeyHex: string,
  ownPrivateKey: CryptoKey,
  apiKey: string | null,
): Promise<unknown> {
  const ctx = await setupPopup(popup, ownPublicKeyHex, ownPrivateKey, apiKey);
  const chain = buildChain(apiKey);

  // Phase 1: Key exchange handshake (method: "handshake")
  const peerPublicKeyHex = await doKeyExchangeHandshake(ctx, chain);

  // Derive shared secret
  const peerPublicKey = await importKeyFromHex("public", peerPublicKeyHex);
  const sharedSecret = await deriveSecret(ownPrivateKey, peerPublicKey);

  // Phase 2: Send encrypted signing request
  return doEncryptedRequest(ctx, method, params, sharedSecret, chain);
}

/**
 * Phase 1: Send a "handshake" method to establish ECDH session.
 * Returns the popup's public key hex from the response.
 */
function doKeyExchangeHandshake(
  ctx: PopupContext,
  chain: { id: number; rpcUrl?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    function handler(event: MessageEvent) {
      if (event.origin !== ctx.origin) return;
      const msg = event.data;

      if (msg?.event === "PopupUnload") {
        ctx.cleanup();
        window.removeEventListener("message", handler);
        reject(new Error("Popup closed unexpectedly"));
        return;
      }

      if (msg?.requestId || msg?.content) {
        window.removeEventListener("message", handler);

        if (msg?.content?.failure) {
          ctx.cleanup();
          reject(
            new Error(msg.content.failure.message || "Handshake failed"),
          );
          return;
        }

        // The response sender is the popup's public key
        const peerPubKey = msg.sender as string;
        if (!peerPubKey || peerPubKey.length < 10) {
          ctx.cleanup();
          reject(new Error("No peer public key in handshake response"));
          return;
        }

        resolve(peerPubKey);
      }
    }

    window.addEventListener("message", handler);

    // Send handshake with method "handshake" for key exchange only
    ctx.popup.postMessage(
      {
        id: crypto.randomUUID(),
        sender: ctx.ownPublicKeyHex,
        content: {
          handshake: { method: "handshake", params: [] },
          chain,
        },
        timestamp: new Date(),
      },
      ctx.origin,
    );
  });
}

/**
 * Phase 2: Send encrypted RPC request and wait for encrypted response.
 */
function doEncryptedRequest(
  ctx: PopupContext,
  method: string,
  params: unknown,
  sharedSecret: CryptoKey,
  chain: { id: number; rpcUrl?: string },
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    function handler(event: MessageEvent) {
      if (event.origin !== ctx.origin) return;
      const msg = event.data;

      if (msg?.event === "PopupUnload") {
        ctx.cleanup();
        window.removeEventListener("message", handler);
        reject(new Error("Popup closed unexpectedly"));
        return;
      }

      if (msg?.requestId || msg?.content) {
        ctx.cleanup();
        window.removeEventListener("message", handler);

        if (msg?.content?.failure) {
          reject(
            new Error(msg.content.failure.message || "Request failed in popup"),
          );
          return;
        }

        if (msg?.content?.encrypted) {
          decryptAESGCM(sharedSecret, msg.content.encrypted)
            .then((d) => resolve(parseDecryptedResult(d)))
            .catch(reject);
          return;
        }

        resolve(msg.content || msg.data || msg);
      }
    }

    window.addEventListener("message", handler);

    // Encrypt and send the actual RPC request
    encryptAESGCM(sharedSecret, {
      action: { method, params: params ?? [] },
      chain,
    })
      .then((encrypted) => {
        ctx.popup.postMessage(
          {
            id: crypto.randomUUID(),
            sender: ctx.ownPublicKeyHex,
            content: { encrypted },
            timestamp: new Date(),
          },
          ctx.origin,
        );
      })
      .catch((err) => {
        ctx.cleanup();
        window.removeEventListener("message", handler);
        reject(err);
      });
  });
}

/**
 * Decrypt response using ECDH shared secret derived from peer's public key.
 */
async function decryptResponse(
  ownPrivateKey: CryptoKey,
  peerPublicKeyHex: string,
  encrypted: { iv: BufferSource; cipherText: ArrayBuffer },
): Promise<unknown> {
  const peerPublicKey = await importKeyFromHex("public", peerPublicKeyHex);
  const sharedSecret = await deriveSecret(ownPrivateKey, peerPublicKey);
  const decrypted = await decryptAESGCM(sharedSecret, encrypted);
  return parseDecryptedResult(decrypted);
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
  button: {
    padding: "0.75rem 2rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    backgroundColor: "#111",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    marginTop: "0.5rem",
  },
  success: {
    color: "#16a34a",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  error: {
    color: "#dc2626",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
};
