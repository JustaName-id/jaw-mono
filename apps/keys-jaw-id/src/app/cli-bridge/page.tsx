"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { JAW, Mode } from "@jaw.id/core";
import { ReactUIHandler } from "@jaw.id/ui";
import {
  generateKeyPair,
  deriveSharedSecret,
  encrypt,
  decrypt,
  exportKeyToHexString,
  importKeyFromHexString,
} from "@jaw.id/core";

/**
 * CLI Bridge Page — Relay Mode
 *
 * Connects to the cloud relay (wss://relay.jaw.id) instead of a local daemon.
 * All messages are E2E encrypted via ECDH + AES-256-GCM.
 *
 * Flow:
 * 1. CLI generates ECDH keypair, opens this page with session + relay in query, CLI public key in fragment
 * 2. Page generates its own ECDH keypair
 * 3. Page connects to relay, sends key_exchange with its public key
 * 4. Both sides derive shared secret
 * 5. CLI sends encrypted init (apiKey, chainId, etc.)
 * 6. Page initializes JAW SDK, sends encrypted ready
 * 7. CLI sends encrypted RPC requests, page executes and sends encrypted responses
 */

type BridgeState = "connecting" | "connected" | "disconnected" | "error";

/** Base64 encode a Uint8Array or ArrayBuffer */
function toBase64(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Base64 decode to Uint8Array */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptAndSerialize(
  sharedSecret: CryptoKey,
  payload: Record<string, unknown>,
): Promise<{ type: "encrypted"; iv: string; ciphertext: string }> {
  const { iv, cipherText } = await encrypt(sharedSecret, JSON.stringify(payload));
  return {
    type: "encrypted",
    iv: toBase64(iv),
    ciphertext: toBase64(cipherText),
  };
}

async function deserializeAndDecrypt(
  sharedSecret: CryptoKey,
  msg: { iv: string; ciphertext: string },
): Promise<Record<string, unknown>> {
  const iv = fromBase64(msg.iv);
  const cipherText = fromBase64(msg.ciphertext);
  const plaintext = await decrypt(sharedSecret, { iv, cipherText: cipherText.buffer as ArrayBuffer });
  return JSON.parse(plaintext);
}

function CLIBridgeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BridgeState>("connecting");
  const [error, setError] = useState("");
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const sdkRef = useRef<ReturnType<typeof JAW.create> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sharedSecretRef = useRef<CryptoKey | null>(null);

  const sessionId = searchParams.get("session");
  const relayUrl = searchParams.get("relay");

  // Read CLI public key from URL fragment (use ref to survive React Strict Mode double-invoke)
  const cliPublicKeyRef = useRef<string | null>(null);
  const [cliPublicKeyHex, setCliPublicKeyHex] = useState<string | null>(null);

  useEffect(() => {
    if (cliPublicKeyRef.current) {
      // Already read on a previous effect invocation (Strict Mode)
      setCliPublicKeyHex(cliPublicKeyRef.current);
      return;
    }
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    const pk = hashParams.get("pk");
    if (pk) {
      cliPublicKeyRef.current = pk;
      setCliPublicKeyHex(pk);
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  const handleRpcRequest = useCallback(
    async (id: string, method: string, params: unknown) => {
      if (!sdkRef.current || !sharedSecretRef.current || !wsRef.current) return;

      setLastMethod(method);

      try {
        const normalizedParams = Array.isArray(params)
          ? params
          : params !== undefined
            ? [params]
            : [];

        const result = await sdkRef.current.provider.request({
          method,
          params: normalizedParams,
        });

        const address = extractAddress(method, result);

        const envelope = await encryptAndSerialize(sharedSecretRef.current, {
          type: "rpc_response",
          id,
          success: true,
          data: result,
          ...(address ? { address } : {}),
        });

        wsRef.current.send(JSON.stringify(envelope));
      } catch (err) {
        const errObj = err as { code?: number; message?: string };
        const errCode = errObj?.code ?? -32000;
        const errMsg =
          errObj?.message ?? (err instanceof Error ? err.message : String(err));

        if (sharedSecretRef.current && wsRef.current) {
          const envelope = await encryptAndSerialize(sharedSecretRef.current, {
            type: "rpc_response",
            id,
            success: false,
            error: { code: errCode, message: errMsg },
          });
          wsRef.current.send(JSON.stringify(envelope));
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!sessionId || !relayUrl || !cliPublicKeyHex) return;

    let ws: WebSocket | null = null;
    let beforeUnloadHandler: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Generate browser ECDH keypair
        const browserKeyPair = await generateKeyPair();
        const browserPublicKeyHex = await exportKeyToHexString("public", browserKeyPair.publicKey);

        // Derive shared secret using CLI's public key
        const cliPublicKey = await importKeyFromHexString("public", cliPublicKeyHex);
        const sharedSecret = await deriveSharedSecret(browserKeyPair.privateKey, cliPublicKey);

        if (cancelled) return;

        sharedSecretRef.current = sharedSecret;

        // Connect to relay
        const wsUrl = `${relayUrl}?session=${encodeURIComponent(sessionId)}&role=browser`;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setState("connected");
          // Send key_exchange (unencrypted — contains only our public key)
          ws!.send(
            JSON.stringify({
              type: "key_exchange",
              publicKey: browserPublicKeyHex,
            }),
          );
        };

        ws.onmessage = async (event) => {
          if (cancelled) return;
          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(event.data as string) as Record<string, unknown>;
          } catch {
            return;
          }

          if (msg.type === "encrypted" && sharedSecretRef.current) {
            try {
              const inner = await deserializeAndDecrypt(sharedSecretRef.current, msg as { iv: string; ciphertext: string });

              switch (inner.type) {
                case "init": {
                  const apiKey = inner.apiKey as string;
                  const chainId = (inner.chainId as number) ?? 1;
                  const ens = inner.ens as string | undefined;
                  const paymasterUrl = inner.paymasterUrl as string | undefined;

                  if (!apiKey) {
                    setState("error");
                    setError("CLI sent empty API key");
                    return;
                  }

                  if (!sdkRef.current) {
                    sdkRef.current = JAW.create({
                      appName: "JAW CLI",
                      defaultChainId: chainId,
                      preference: {
                        mode: Mode.AppSpecific,
                        uiHandler: new ReactUIHandler(),
                        showTestnets: true,
                      },
                      apiKey,
                      ...(ens ? { ens } : {}),
                      ...(paymasterUrl
                        ? { paymasters: { [chainId]: { url: paymasterUrl } } }
                        : {}),
                    });
                  }

                  // Send encrypted ready
                  const readyEnvelope = await encryptAndSerialize(sharedSecretRef.current!, {
                    type: "ready",
                    chainId,
                  });
                  ws!.send(JSON.stringify(readyEnvelope));
                  break;
                }

                case "rpc_request":
                  handleRpcRequest(inner.id as string, inner.method as string, inner.params);
                  break;

                case "shutdown":
                  window.close();
                  break;
              }
            } catch (err) {
              console.error("[cli-bridge] Failed to decrypt/process message:", err);
            }
          }

          if (msg.type === "ping") {
            ws!.send(JSON.stringify({ type: "pong" }));
          }

          if (msg.type === "error" && msg.code === "session_expired") {
            setState("error");
            setError("Session expired. Run a new CLI command to reconnect.");
          }
        };

        ws.onclose = () => {
          if (!cancelled) setState("disconnected");
        };

        ws.onerror = () => {
          if (!cancelled) {
            setState("error");
            setError("Relay connection failed");
          }
        };

        beforeUnloadHandler = () => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.close(1000, "Browser tab closed");
          }
        };
        window.addEventListener("beforeunload", beforeUnloadHandler);
      } catch (err) {
        console.error("[cli-bridge] Setup failed:", err);
        if (!cancelled) {
          setState("error");
          setError(err instanceof Error ? err.message : "Failed to initialize encryption");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (beforeUnloadHandler) {
        window.removeEventListener("beforeunload", beforeUnloadHandler);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [sessionId, relayUrl, cliPublicKeyHex, handleRpcRequest]);

  // Validation
  if (!sessionId || !relayUrl) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
          <h1 style={styles.title}>JAW CLI</h1>
          <p style={styles.error}>Error</p>
          <p style={styles.subtext}>Missing required parameters: session, relay</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
        <h1 style={styles.title}>JAW CLI</h1>

        {state === "connecting" && (
          <p style={styles.text}>Connecting to relay...</p>
        )}

        {state === "connected" && (
          <>
            <p style={styles.success}>Connected</p>
            <p style={styles.subtext}>
              This tab is your CLI&apos;s signing backend.
              <br />
              Keep it open while using the CLI.
            </p>
            {lastMethod && (
              <p style={styles.method}>Last request: {lastMethod}</p>
            )}
          </>
        )}

        {state === "disconnected" && (
          <p style={styles.subtext}>
            CLI disconnected. You can close this tab.
          </p>
        )}

        {state === "error" && (
          <>
            <p style={styles.error}>Error</p>
            <p style={styles.subtext}>{error}</p>
          </>
        )}
      </div>
    </div>
  );
}

function extractAddress(method: string, result: unknown): string | undefined {
  if (method !== "wallet_connect" && method !== "eth_requestAccounts") return;

  if (Array.isArray(result) && typeof result[0] === "string") {
    return result[0];
  }
  if (result && typeof result === "object" && "accounts" in result) {
    const accounts = (result as Record<string, unknown>).accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const first = accounts[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && "address" in first) {
        return (first as Record<string, unknown>).address as string;
      }
    }
  }
  return undefined;
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
    marginLeft: "auto",
    marginRight: "auto",
    display: "block",
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
  method: {
    color: "#666",
    fontSize: "0.8rem",
    fontFamily: "monospace",
    marginTop: "1rem",
    padding: "0.5rem",
    backgroundColor: "#f5f5f5",
    borderRadius: "4px",
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
