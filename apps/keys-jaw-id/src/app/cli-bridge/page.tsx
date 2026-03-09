"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useRef } from "react";
import { JAW, Mode } from "@jaw.id/core";
import { ReactUIHandler } from "@jaw.id/ui";

/**
 * CLI Bridge Page
 *
 * Runs the JAW SDK in AppSpecific mode directly on keys.jaw.id.
 * Since this page shares the same origin as the CrossPlatform popup,
 * passkeys and accounts are identical — no popup or ECDH needed.
 *
 * Flow:
 * 1. CLI opens this page with callback URL + RPC method/params
 * 2. Page initializes JAW SDK with AppSpecific mode + ReactUIHandler
 * 3. ReactUIHandler renders signing UI inline
 * 4. User authenticates with passkey
 * 5. Result POSTs back to CLI's localhost callback
 */

type BridgeState = "processing" | "success" | "error";

function CLIBridgeContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BridgeState>("processing");
  const [error, setError] = useState("");
  const sdkRef = useRef<ReturnType<typeof JAW.create> | null>(null);
  const startedRef = useRef(false);

  const callbackUrl = searchParams.get("callback");
  const requestId = searchParams.get("requestId");
  const method = searchParams.get("method");
  const paramsRaw = searchParams.get("params");
  const chainIdParam = searchParams.get("chainId");

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

  // Auto-start the bridge flow once apiKey is loaded
  useEffect(() => {
    if (
      startedRef.current ||
      validationError ||
      !callbackUrl ||
      !requestId ||
      !method ||
      !apiKey
    )
      return;
    startedRef.current = true;

    (async () => {
      try {
        const chainId = chainIdParam ? Number(chainIdParam) : 1;

        // Initialize JAW SDK with AppSpecific mode — ReactUIHandler renders inline
        if (!sdkRef.current) {
          sdkRef.current = JAW.create({
            appName: "JAW CLI",
            defaultChainId: chainId,
            preference: {
              mode: Mode.AppSpecific,
              uiHandler: new ReactUIHandler(),
            },
            apiKey,
          });
        }

        // Parse and normalize params
        const rawParams = paramsRaw ? JSON.parse(paramsRaw) : undefined;
        const params = Array.isArray(rawParams)
          ? rawParams
          : rawParams !== undefined
            ? [rawParams]
            : [];

        // Execute the RPC method — ReactUIHandler shows signing UI automatically
        const result = await sdkRef.current.provider.request({
          method,
          params,
        });

        // POST result to CLI callback
        await fetch(callbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, success: true, data: result }),
        });

        setState("success");
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // Try to send error to CLI
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

        setState("error");
        setError(errMsg);
      }
    })();
  }, [apiKey, validationError, callbackUrl, requestId, method, paramsRaw, chainIdParam]);

  if (validationError) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <img src="/jaw-logo.png" alt="JAW" style={styles.logo} />
          <h1 style={styles.title}>JAW CLI</h1>
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
        <h1 style={styles.title}>JAW CLI</h1>

        {state === "processing" && (
          <p style={styles.text}>Complete the action to continue...</p>
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
