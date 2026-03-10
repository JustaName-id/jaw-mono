#!/usr/bin/env node
/**
 * WS Bridge Daemon
 *
 * Long-lived background process that:
 * 1. Starts a WebSocket server on 127.0.0.1:{random_port}
 * 2. Opens browser to keys.jaw.id/cli-bridge
 * 3. Accepts WebSocket connections from the browser (SDK) and CLI clients
 * 4. Routes RPC requests from CLI clients to the browser SDK
 * 5. Writes connection info to ~/.jaw/bridge.json
 *
 * The daemon stays alive across CLI commands so the browser SDK instance
 * (and its in-memory state) persists.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WebSocketServer, WebSocket } from "ws";

const JAW_DIR = path.join(os.homedir(), ".jaw");
const BRIDGE_PATH = path.join(JAW_DIR, "bridge.json");
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle → auto-shutdown

// ── Types ──────────────────────────────────────────────────────────

interface BridgeInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

interface PendingRequest {
  clientWs: WebSocket;
  clientId: string;
  timer: ReturnType<typeof setTimeout>;
}

// ── Parse args from parent process ─────────────────────────────────

const args = JSON.parse(process.argv[2] ?? "{}") as {
  keysUrl: string;
  chainId: number;
  ens?: string;
  paymasterUrl?: string;
  timeout?: number;
};

// API key is passed via env var to avoid exposure in `ps aux` output
const apiKey = process.env.JAW_DAEMON_API_KEY ?? "";
// Clear from environment immediately after reading
delete process.env.JAW_DAEMON_API_KEY;

const token = crypto.randomUUID();
const timeout = args.timeout ?? 120_000;

// Track pending requests: daemonRequestId -> { clientWs, clientId }
const pendingRequests = new Map<string, PendingRequest>();

// Browser SDK connection
let browserWs: WebSocket | null = null;
let browserReady = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

// Track connected CLI clients (to notify when browser connects)
const cliClients = new Set<WebSocket>();

// ── Idle management ────────────────────────────────────────────────

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    cleanup();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);
}

// ── Cleanup ────────────────────────────────────────────────────────

function cleanup(): void {
  if (heartbeat) clearInterval(heartbeat);
  // Notify browser to close the tab
  if (browserWs?.readyState === WebSocket.OPEN) {
    browserWs.send(JSON.stringify({ type: "shutdown" }));
  }
  try {
    if (fs.existsSync(BRIDGE_PATH)) fs.unlinkSync(BRIDGE_PATH);
  } catch {
    // ignore
  }
}

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("exit", cleanup);

// ── Start WebSocket server ─────────────────────────────────────────

const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB – plenty for any RPC payload
const wss = new WebSocketServer({ host: "127.0.0.1", port: 0, maxPayload: MAX_PAYLOAD_BYTES });

wss.on("listening", async () => {
  const addr = wss.address();
  if (typeof addr === "string" || !addr) {
    process.exit(1);
  }

  const port = addr.port;

  // Write bridge info
  fs.mkdirSync(JAW_DIR, { recursive: true, mode: 0o700 });
  const info: BridgeInfo = {
    port,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(BRIDGE_PATH, JSON.stringify(info, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });

  // Open browser
  const bridgeUrl = buildBridgeUrl(port);
  const { default: open } = await import("open");
  await open(bridgeUrl);

  resetIdleTimer();
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://127.0.0.1");
  const urlToken = url.searchParams.get("token");
  const role = url.searchParams.get("role"); // "browser" or "cli"

  if (urlToken !== token) {
    ws.close(4001, "Invalid token");
    return;
  }

  if (role === "browser") {
    handleBrowserConnection(ws);
  } else {
    handleCliConnection(ws);
  }
});

// ── Browser connection ─────────────────────────────────────────────

function handleBrowserConnection(ws: WebSocket): void {
  if (browserWs) {
    browserWs.close(4000, "Replaced by new browser connection");
  }
  browserWs = ws;
  browserReady = false;

  // Send API key over the authenticated WebSocket rather than via URL
  ws.send(JSON.stringify({ type: "init", apiKey }));

  ws.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (msg.type) {
      case "ready":
        browserReady = true;
        // Start heartbeat
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = setInterval(() => {
          if (browserWs?.readyState === WebSocket.OPEN) {
            browserWs.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_INTERVAL_MS);
        // Notify any waiting CLI clients that browser is now connected
        for (const cli of cliClients) {
          if (cli.readyState === WebSocket.OPEN) {
            cli.send(JSON.stringify({ type: "browser_connected" }));
          }
        }
        break;

      case "rpc_response": {
        const id = msg.id as string;
        const pending = pendingRequests.get(id);
        if (!pending) return;

        clearTimeout(pending.timer);
        pendingRequests.delete(id);

        // Forward response to the CLI client using its original request ID
        if (pending.clientWs.readyState === WebSocket.OPEN) {
          pending.clientWs.send(
            JSON.stringify({
              id: pending.clientId,
              type: "rpc_response",
              success: msg.success,
              data: msg.data,
              error: msg.error,
              address: msg.address,
            }),
          );
        }
        break;
      }

      case "pong":
        break;
    }
  });

  ws.on("close", () => {
    if (browserWs === ws) {
      browserReady = false;
      browserWs = null;
    }
  });
}

// ── CLI client connection ──────────────────────────────────────────

function handleCliConnection(ws: WebSocket): void {
  resetIdleTimer();
  cliClients.add(ws);

  // Send current status
  ws.send(
    JSON.stringify({
      type: "status",
      browserConnected: browserReady,
    }),
  );

  ws.on("close", () => {
    cliClients.delete(ws);
  });

  ws.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.type === "rpc_request") {
      resetIdleTimer();
      handleCliRpcRequest(ws, msg);
    } else if (msg.type === "shutdown") {
      cleanup();
      process.exit(0);
    }
  });
}

function handleCliRpcRequest(
  clientWs: WebSocket,
  msg: Record<string, unknown>,
): void {
  const clientId = msg.id as string;

  if (!browserReady || !browserWs || browserWs.readyState !== WebSocket.OPEN) {
    clientWs.send(
      JSON.stringify({
        id: clientId,
        type: "rpc_response",
        success: false,
        error: {
          code: -32000,
          message: "Browser SDK not connected. The browser tab may have been closed.",
        },
      }),
    );
    return;
  }

  // Generate a daemon-internal ID and forward to browser
  const daemonId = crypto.randomUUID();

  const timer = setTimeout(() => {
    pendingRequests.delete(daemonId);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          id: clientId,
          type: "rpc_response",
          success: false,
          error: {
            code: -32000,
            message: `Request timed out after ${timeout / 1000}s`,
          },
        }),
      );
    }
  }, timeout);

  pendingRequests.set(daemonId, { clientWs, clientId, timer });

  browserWs.send(
    JSON.stringify({
      id: daemonId,
      type: "rpc_request",
      method: msg.method,
      params: msg.params,
    }),
  );
}

// ── Build bridge URL ───────────────────────────────────────────────

function buildBridgeUrl(port: number): string {
  const url = new URL("/cli-bridge", args.keysUrl);
  url.searchParams.set("wsPort", String(port));
  url.searchParams.set("chainId", String(args.chainId));
  if (args.ens) {
    url.searchParams.set("ens", args.ens);
  }
  if (args.paymasterUrl) {
    url.searchParams.set("paymasterUrl", args.paymasterUrl);
  }
  // Only token in fragment — apiKey is sent over WebSocket after connection
  url.hash = `token=${encodeURIComponent(token)}`;
  return url.toString();
}
