"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { JAW, Mode } from "@jaw.id/core";
import { ReactUIHandler } from "@jaw.id/ui";

/**
 * CLI Bridge Page — Relay Mode
 *
 * Runs the JAW SDK in AppSpecific mode on keys.jaw.id and connects to the
 * cloud relay at wss://relay.jaw.id/v1/{session}. All RPC requests from the
 * CLI flow through the relay to this page's SDK instance.
 *
 * This eliminates mixed-content issues (no ws:// from HTTPS) and works
 * in Brave, Safari, and all browsers.
 *
 * Flow:
 * 1. CLI daemon connects to relay as "daemon" role
 * 2. CLI opens this page with session in query params, token in fragment
 * 3. Page connects to relay as "browser" role
 * 4. Relay pairs daemon + browser, forwards messages bidirectionally
 * 5. Daemon sends config (apiKey, chainId, etc.) through the relay
 * 6. Page initializes JAW SDK with the received config
 * 7. CLI sends RPC requests → relay → this page → SDK → response → relay → CLI
 */

const DEFAULT_RELAY_URL = "wss://relay.jaw.id";

// Allowlist of trusted relay origins to prevent open redirect attacks.
// An attacker-controlled relay= param would receive the API key via the init message.
const ALLOWED_RELAY_ORIGINS = [
  "wss://relay.jaw.id",
  "ws://localhost",
  "ws://127.0.0.1",
];

function isAllowedRelayUrl(url: string): boolean {
  return ALLOWED_RELAY_ORIGINS.some((origin) => url.startsWith(origin));
}

type BridgeState = "connecting" | "connected" | "disconnected" | "error";

function CLIBridgeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BridgeState>("connecting");
  const [error, setError] = useState("");
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const sdkRef = useRef<ReturnType<typeof JAW.create> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const startedRef = useRef(false);

  const session = searchParams.get("session");
  const relayUrl = searchParams.get("relay") ?? DEFAULT_RELAY_URL;

  // Read token + config from the URL fragment (never sent to server or relay)
  const [token, setToken] = useState<string | null>(null);
  const [fragmentConfig, setFragmentConfig] = useState<{
    apiKey: string;
    chainId: number;
    ens?: string;
    paymasterUrl?: string;
  } | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    setToken(hashParams.get("token"));

    const fApiKey = hashParams.get("apiKey");
    const fChainId = hashParams.get("chainId");
    if (fApiKey && fChainId) {
      setFragmentConfig({
        apiKey: fApiKey,
        chainId: Number(fChainId) || 1,
        ens: hashParams.get("ens") ?? undefined,
        paymasterUrl: hashParams.get("paymasterUrl") ?? undefined,
      });
    }

    // Clear the fragment from the URL to avoid any leakage
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  const handleRpcRequest = useCallback(
    async (id: string, method: string, params: unknown) => {
      if (!sdkRef.current) return;

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

        // Extract address from connect responses for the CLI
        const address = extractAddress(method, result);

        wsRef.current?.send(
          JSON.stringify({
            id,
            type: "rpc_response",
            success: true,
            data: result,
            ...(address ? { address } : {}),
          }),
        );
      } catch (err) {
        const errObj = err as { code?: number; message?: string };
        const errCode = errObj?.code ?? -32000;
        const errMsg =
          errObj?.message ?? (err instanceof Error ? err.message : String(err));
        wsRef.current?.send(
          JSON.stringify({
            id,
            type: "rpc_response",
            success: false,
            error: { code: errCode, message: errMsg },
          }),
        );
      }
    },
    [],
  );

  useEffect(() => {
    if (
      startedRef.current ||
      !session ||
      !token ||
      !relayUrl ||
      !fragmentConfig
    )
      return;
    startedRef.current = true;

    // Connect to the relay as the browser peer.
    // Token is sent as the first message after connect — browser WebSocket API
    // does not support custom headers, and query params are logged by CF.
    const relayWsUrl = `${relayUrl}/v1/${encodeURIComponent(session)}?role=browser`;
    const ws = new WebSocket(relayWsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      // Authenticate via first message (browser WS API has no header support)
      ws.send(JSON.stringify({ type: "auth", token }));
      setState("connected");
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (msg.type) {
        case "init": {
          // Daemon signals to initialize. Config comes from URL fragment (not relay).
          if (!fragmentConfig) {
            setState("error");
            setError("Missing config — API key not found in URL");
            return;
          }

          const { apiKey, chainId, ens, paymasterUrl } = fragmentConfig;

          if (!sdkRef.current) {
            try {
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
            } catch (err) {
              setState("error");
              setError(
                `SDK init failed: ${err instanceof Error ? err.message : String(err)}`,
              );
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `SDK init failed: ${err instanceof Error ? err.message : String(err)}`,
                }),
              );
              return;
            }
          }

          // SDK initialized — notify daemon we're ready (via relay)
          ws.send(
            JSON.stringify({
              type: "ready",
              chainId,
            }),
          );
          break;
        }

        case "rpc_request":
          handleRpcRequest(msg.id as string, msg.method as string, msg.params);
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "shutdown":
          window.close();
          break;

        case "peer_connected":
        case "peer_disconnected":
          // Relay control messages — handled by daemon side
          break;
      }
    };

    ws.onclose = () => {
      setState("disconnected");
    };

    ws.onerror = () => {
      setState("error");
      setError("Failed to connect to relay");
    };

    // Clean close on tab close/refresh
    const handleBeforeUnload = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "Browser tab closed");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      ws.close();
    };
  }, [session, token, relayUrl, fragmentConfig, handleRpcRequest]);

  // Validation
  if (!session || !isAllowedRelayUrl(relayUrl)) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
          <h1 style={styles.title}>JAW CLI</h1>
          <p style={styles.error}>Error</p>
          <p style={styles.subtext}>
            {!session ? "Missing parameter: session" : "Invalid relay URL"}
          </p>
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
          <>
            <p style={styles.subtext}>
              CLI disconnected. You can close this tab.
            </p>
          </>
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
