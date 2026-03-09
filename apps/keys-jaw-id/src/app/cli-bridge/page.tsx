"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useRef, useCallback } from "react";
import { JAW, Mode } from "@jaw.id/core";
import { ReactUIHandler } from "@jaw.id/ui";

/**
 * CLI Bridge Page — WebSocket Mode
 *
 * Runs the JAW SDK in AppSpecific mode on keys.jaw.id and connects to the
 * CLI via a persistent WebSocket. All RPC requests from the CLI flow through
 * this page's SDK instance.
 *
 * Flow:
 * 1. CLI starts a WebSocket server on 127.0.0.1:{port}
 * 2. CLI opens this page with wsPort + config params
 * 3. Page initializes JAW SDK and connects WebSocket
 * 4. CLI sends RPC requests over WebSocket
 * 5. Page executes them via provider.request() and sends results back
 */

type BridgeState = "connecting" | "connected" | "disconnected" | "error";

function CLIBridgeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BridgeState>("connecting");
  const [error, setError] = useState("");
  const [lastMethod, setLastMethod] = useState<string | null>(null);
  const sdkRef = useRef<ReturnType<typeof JAW.create> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const startedRef = useRef(false);

  const wsPort = searchParams.get("wsPort");
  const chainIdParam = searchParams.get("chainId");
  const ens = searchParams.get("ens");
  const paymasterUrl = searchParams.get("paymasterUrl");

  // Read sensitive params from URL fragment
  const [fragmentParams, setFragmentParams] = useState<{
    apiKey: string | null;
    token: string | null;
  }>({ apiKey: null, token: null });

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    const hashParams = new URLSearchParams(hash);
    setFragmentParams({
      apiKey: hashParams.get("apiKey"),
      token: hashParams.get("token"),
    });
  }, []);

  const handleRpcRequest = useCallback(
    async (
      id: string,
      method: string,
      params: unknown,
    ) => {
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
        // Core SDK's provider.request() rejects with serialized error objects
        // { code, message, data } or standard Error instances
        const errObj = err as { code?: number; message?: string };
        const errCode = errObj?.code ?? -32000;
        const errMsg =
          errObj?.message ??
          (err instanceof Error ? err.message : String(err));
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
    if (startedRef.current || !wsPort || !fragmentParams.apiKey || !fragmentParams.token)
      return;
    startedRef.current = true;

    const chainId = chainIdParam ? Number(chainIdParam) : 1;
    const apiKey = fragmentParams.apiKey;
    const token = fragmentParams.token;

    // Initialize JAW SDK
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

    // Connect WebSocket to CLI
    const wsUrl = `ws://127.0.0.1:${wsPort}?token=${encodeURIComponent(token)}&role=browser`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState("connected");
      // Notify CLI that SDK is ready
      ws.send(
        JSON.stringify({
          type: "ready",
          chainId,
        }),
      );
    };

    ws.onmessage = (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      switch (msg.type) {
        case "rpc_request":
          handleRpcRequest(
            msg.id as string,
            msg.method as string,
            msg.params,
          );
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    };

    ws.onclose = () => {
      setState("disconnected");
    };

    ws.onerror = () => {
      setState("error");
      setError("WebSocket connection failed");
    };

    return () => {
      ws.close();
    };
  }, [wsPort, chainIdParam, ens, paymasterUrl, fragmentParams, handleRpcRequest]);

  // Validation
  if (!wsPort) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
          <h1 style={styles.title}>JAW CLI</h1>
          <p style={styles.error}>Error</p>
          <p style={styles.subtext}>Missing required parameter: wsPort</p>
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
          <p style={styles.text}>Connecting to CLI...</p>
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
            <p style={styles.subtext}>CLI disconnected. You can close this tab.</p>
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
