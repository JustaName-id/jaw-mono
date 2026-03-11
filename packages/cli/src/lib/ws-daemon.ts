#!/usr/bin/env node
/**
 * WS Bridge Daemon
 *
 * Long-lived background process that:
 * 1. Starts a WebSocket server on 127.0.0.1:{random_port} for CLI clients
 * 2. Connects outbound to wss://relay.jaw.id/{session} as the daemon peer
 * 3. Opens browser to keys.jaw.id/cli-bridge?session={id}
 * 4. Routes RPC requests from CLI clients → relay → browser SDK
 * 5. Writes connection info to ~/.jaw/bridge.json
 *
 * The relay solves mixed-content blocking: both daemon and browser connect
 * outbound to WSS (no ws:// from an HTTPS page).
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { RelayConnection } from "./relay-client.js";

const JAW_DIR = path.join(os.homedir(), ".jaw");
const BRIDGE_PATH = path.join(JAW_DIR, "bridge.json");
const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle → auto-shutdown

// ── Limits ────────────────────────────────────────────────────────
const MAX_PENDING_REQUESTS = 100;
const MAX_CLI_CLIENTS = 50;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per client

// ── Types ──────────────────────────────────────────────────────────

interface BridgeInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
  sessionId: string;
}

interface PendingRequest {
  clientWs: WebSocket;
  clientId: string;
  timer: ReturnType<typeof setTimeout>;
}

interface RateLimitEntry {
  timestamps: number[];
}

// ── keysUrl validation (duplicated from validation.ts for standalone daemon) ─

function isValidKeysUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isTrustedHost =
      parsed.hostname.endsWith(".jaw.id") ||
      parsed.hostname === "jaw.id" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1";
    const isSecure =
      parsed.protocol === "https:" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1";
    return isTrustedHost && isSecure;
  } catch {
    return false;
  }
}

// ── Parse args from parent process ─────────────────────────────────

const args = JSON.parse(process.argv[2] ?? "{}") as {
  keysUrl: string;
  chainId: number;
  ens?: string;
  paymasterUrl?: string;
  timeout?: number;
  relayUrl: string;
  sessionId: string;
};

// Validate keysUrl before proceeding
if (!isValidKeysUrl(args.keysUrl)) {
  process.stderr.write(
    `Untrusted keysUrl: ${args.keysUrl}. Must be a *.jaw.id domain (HTTPS) or localhost.\n`,
  );
  process.exit(1);
}

// API key is passed via env var to avoid exposure in `ps aux` output
const apiKey = process.env.JAW_DAEMON_API_KEY ?? "";
// Clear from environment immediately after reading
delete process.env.JAW_DAEMON_API_KEY;

const token = crypto.randomUUID();
const timeout = args.timeout ?? 120_000;

// Track pending requests: daemonRequestId -> { clientWs, clientId }
const pendingRequests = new Map<string, PendingRequest>();

// Browser SDK connection state (tracked via relay control messages)
let browserReady = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

// Browser reopen state
let lastBrowserOpenTime = 0;
const BROWSER_REOPEN_COOLDOWN_MS = 5_000;

// Track connected CLI clients
const cliClients = new Set<WebSocket>();

// Per-client rate limiting
const rateLimits = new WeakMap<WebSocket, RateLimitEntry>();

// Relay connection
let relay: RelayConnection | null = null;

// ── Rate limiting ─────────────────────────────────────────────────

function isRateLimited(ws: WebSocket): boolean {
  const now = Date.now();
  let entry = rateLimits.get(ws);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimits.set(ws, entry);
  }

  entry.timestamps = entry.timestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.timestamps.push(now);
  return false;
}

// ── Browser reopen ────────────────────────────────────────────────

async function reopenBrowser(): Promise<void> {
  if (browserReady) return;

  const now = Date.now();
  if (now - lastBrowserOpenTime < BROWSER_REOPEN_COOLDOWN_MS) return;

  lastBrowserOpenTime = now;
  const bridgeUrl = buildBridgeUrl();
  try {
    const { default: open } = await import("open");
    await open(bridgeUrl);
  } catch {
    // Best-effort; CLI will time out if browser never connects
  }
}

// ── Idle management ────────────────────────────────────────────────

function resetIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    cleanup();
    process.exit(0);
  }, IDLE_TIMEOUT_MS);
}

// ── Cleanup ────────────────────────────────────────────────────────

let cleaned = false;

function cleanup(): void {
  if (cleaned) return;
  cleaned = true;

  if (heartbeat) clearInterval(heartbeat);
  // Send shutdown through relay so browser closes the tab
  if (relay?.isOpen()) {
    relay.send(JSON.stringify({ type: "shutdown" }));
  }
  relay?.close();
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

// ── Relay message handler (messages from browser via relay) ────────

function handleRelayMessage(data: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  switch (msg.type) {
    case "ready":
      browserReady = true;
      // Start heartbeat
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (relay?.isOpen()) {
          relay.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL_MS);
      // Notify any waiting CLI clients
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
}

function handleBrowserDisconnected(): void {
  browserReady = false;

  // Fail in-flight requests — they can't complete without a browser.
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    if (pending.clientWs.readyState === WebSocket.OPEN) {
      pending.clientWs.send(
        JSON.stringify({
          id: pending.clientId,
          type: "rpc_response",
          success: false,
          error: {
            code: -32001,
            message:
              "Browser tab was closed. Reopening — please retry in a few seconds.",
          },
        }),
      );
    }
  }
  pendingRequests.clear();
}

// ── Start local WebSocket server (CLI clients only) ────────────────

const MAX_PAYLOAD_BYTES = 1_048_576;

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port: 0,
  maxPayload: MAX_PAYLOAD_BYTES,
});

wss.on("listening", async () => {
  const addr = wss.address();
  if (typeof addr === "string" || !addr) {
    process.exit(1);
  }

  const port = addr.port;

  // Connect to relay
  relay = new RelayConnection({
    relayUrl: args.relayUrl,
    sessionId: args.sessionId,
    token,
    onMessage: handleRelayMessage,
    onPeerConnected: () => {
      // Browser connected to relay — signal it to initialize.
      // API key + config are passed via URL fragment (never through relay).
      if (relay?.isOpen()) {
        relay.send(JSON.stringify({ type: "init" }));
      }
    },
    onPeerDisconnected: handleBrowserDisconnected,
    onClose: () => {
      // Relay connection lost — browser effectively disconnected
      if (browserReady) {
        handleBrowserDisconnected();
      }
    },
    onError: () => {
      // Logged for debugging via daemon.log stderr
    },
  });

  try {
    await relay.connect();
  } catch (err) {
    process.stderr.write(
      `Failed to connect to relay: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  // Write bridge info
  fs.mkdirSync(JAW_DIR, { recursive: true, mode: 0o700 });
  const info: BridgeInfo = {
    port,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    sessionId: args.sessionId,
  };
  fs.writeFileSync(BRIDGE_PATH, JSON.stringify(info, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });

  // Open browser
  lastBrowserOpenTime = Date.now();
  const bridgeUrl = buildBridgeUrl();
  const { default: open } = await import("open");
  await open(bridgeUrl);

  resetIdleTimer();
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", "http://127.0.0.1");
  const urlToken = url.searchParams.get("token");

  if (urlToken !== token) {
    ws.close(4001, "Invalid token");
    return;
  }

  // All local connections are CLI clients — browser goes through relay
  handleCliConnection(ws);
});

// ── CLI client connection ──────────────────────────────────────────

function handleCliConnection(ws: WebSocket): void {
  if (cliClients.size >= MAX_CLI_CLIENTS) {
    ws.close(4002, "Too many CLI connections");
    return;
  }

  resetIdleTimer();
  cliClients.add(ws);

  // Send current status
  ws.send(
    JSON.stringify({
      type: "status",
      browserConnected: browserReady,
    }),
  );

  // Auto-reopen browser if disconnected
  if (!browserReady) {
    reopenBrowser();
  }

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

  // Rate limit per client
  if (isRateLimited(clientWs)) {
    clientWs.send(
      JSON.stringify({
        id: clientId,
        type: "rpc_response",
        success: false,
        error: {
          code: -32005,
          message: "Rate limited. Too many requests — try again shortly.",
        },
      }),
    );
    return;
  }

  // Cap pending requests
  if (pendingRequests.size >= MAX_PENDING_REQUESTS) {
    clientWs.send(
      JSON.stringify({
        id: clientId,
        type: "rpc_response",
        success: false,
        error: {
          code: -32006,
          message:
            "Too many pending requests. Wait for current requests to complete.",
        },
      }),
    );
    return;
  }

  if (!browserReady || !relay?.isOpen()) {
    reopenBrowser();
    clientWs.send(
      JSON.stringify({
        id: clientId,
        type: "rpc_response",
        success: false,
        error: {
          code: -32001,
          message:
            "Browser tab was closed. Reopening — please retry in a few seconds.",
        },
      }),
    );
    return;
  }

  // Generate a daemon-internal ID and forward to browser via relay
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

  relay.send(
    JSON.stringify({
      id: daemonId,
      type: "rpc_request",
      method: msg.method,
      params: msg.params,
    }),
  );
}

// ── Build bridge URL ───────────────────────────────────────────────

function buildBridgeUrl(): string {
  const url = new URL("/cli-bridge", args.keysUrl);
  url.searchParams.set("session", args.sessionId);
  url.searchParams.set("relay", args.relayUrl);
  // Token + API key in fragment — never sent to server or relay
  const fragment = new URLSearchParams({
    token,
    apiKey,
    chainId: String(args.chainId),
    ...(args.ens ? { ens: args.ens } : {}),
    ...(args.paymasterUrl ? { paymasterUrl: args.paymasterUrl } : {}),
  });
  url.hash = fragment.toString();
  return url.toString();
}
