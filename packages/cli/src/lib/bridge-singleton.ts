/**
 * Bridge lifecycle management.
 *
 * - Spawns a background daemon if one isn't running
 * - Creates a WSBridge client connected to the daemon
 * - Provides shutdown to kill the daemon
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execSync } from "node:child_process";
import { PATHS } from "./paths.js";
import { ensureDir } from "./config.js";
import { WSBridge } from "./ws-bridge.js";
import { loadConfig } from "./config.js";
import { isValidKeysUrl } from "./validation.js";

/**
 * Find the dist directory root by walking up from the current file.
 * Needed because tsup inlines this code into consuming entry points,
 * so import.meta.url may point to e.g. dist/commands/rpc/call.js
 * rather than dist/lib/bridge-singleton.js.
 */
function findDistDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  // Walk up until we find a directory that contains lib/ws-daemon.js
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "lib", "ws-daemon.js");
    if (fs.existsSync(candidate)) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Cannot find ws-daemon.js in dist tree");
}

const JAW_KEYS_URL = "https://keys.jaw.id";

interface BridgeInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

export interface BridgeOptions {
  keysUrl?: string;
  apiKey: string;
  chainId?: number;
  ens?: string;
  paymasterUrl?: string;
  timeout?: number;
}

/**
 * Verify that the process at `pid` is actually our ws-daemon, not an
 * impersonator that killed the real daemon and took over the port.
 */
function isDaemonProcess(pid: number): boolean {
  // Validate PID is a positive integer to prevent command injection via bridge.json
  if (!Number.isInteger(pid) || pid <= 0 || pid > 4_194_304) return false;

  try {
    // Signal 0 checks if process exists
    process.kill(pid, 0);
  } catch {
    return false;
  }

  try {
    // Verify the process command line contains ws-daemon
    const cmd = execSync(`ps -p ${String(pid)} -o command=`, {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    return cmd.includes("ws-daemon");
  } catch {
    // If ps fails (process just died), treat as invalid
    return false;
  }
}

function loadBridgeInfo(): BridgeInfo | null {
  try {
    if (!fs.existsSync(PATHS.bridge)) return null;
    const raw = fs.readFileSync(PATHS.bridge, "utf-8");
    const info = JSON.parse(raw) as BridgeInfo;
    if (!isDaemonProcess(info.pid)) {
      // Process is dead or not our daemon — clean up stale file
      try {
        fs.unlinkSync(PATHS.bridge);
      } catch {
        /* ignore */
      }
      return null;
    }
    return info;
  } catch {
    return null;
  }
}

/**
 * Ensure a daemon is running and return a connected WSBridge client.
 */
export async function getBridge(options: BridgeOptions): Promise<WSBridge> {
  let info = loadBridgeInfo();

  if (!info) {
    info = await spawnDaemon(options);
  }

  const bridge = new WSBridge({
    port: info.port,
    token: info.token,
    timeout: options.timeout,
  });

  await bridge.connect();
  return bridge;
}

/**
 * Shutdown the running daemon.
 */
export async function shutdownDaemon(): Promise<void> {
  const info = loadBridgeInfo();
  if (!info) return;

  // Kill the daemon process directly
  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    // Process already dead
  }

  // Clean up bridge file
  try {
    if (fs.existsSync(PATHS.bridge)) fs.unlinkSync(PATHS.bridge);
  } catch {
    // ignore
  }
}

async function spawnDaemon(options: BridgeOptions): Promise<BridgeInfo> {
  ensureDir(PATHS.root);
  const config = loadConfig();

  const keysUrl = options.keysUrl ?? config.keysUrl ?? JAW_KEYS_URL;
  if (!isValidKeysUrl(keysUrl)) {
    throw new Error(
      `Untrusted keysUrl: ${keysUrl}. Must be a *.jaw.id domain (HTTPS) or localhost.`,
    );
  }

  const daemonArgs = {
    keysUrl,
    chainId: options.chainId ?? config.defaultChain ?? 1,
    ens: options.ens ?? config.ens,
    paymasterUrl: options.paymasterUrl ?? config.paymasterUrl,
    timeout: options.timeout ?? 120_000,
  };

  const daemonScript = path.join(findDistDir(), "lib", "ws-daemon.js");

  // Remove stale bridge file before spawning
  try {
    if (fs.existsSync(PATHS.bridge)) fs.unlinkSync(PATHS.bridge);
  } catch {
    // ignore
  }

  // Truncate log to prevent unbounded growth from previous sessions
  const logFd = fs.openSync(PATHS.daemonLog, "w", 0o600);
  const child = spawn(
    process.execPath,
    [daemonScript, JSON.stringify(daemonArgs)],
    {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      // Pass API key via env var instead of process args to avoid ps aux exposure
      env: { ...process.env, JAW_DAEMON_API_KEY: options.apiKey },
    },
  );
  child.unref();
  fs.closeSync(logFd);

  // Poll for bridge.json to appear (daemon writes it once WS server is ready)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    const info = loadBridgeInfo();
    if (info) return info;
  }

  throw new Error(
    `Daemon failed to start within 15s. Check ${PATHS.daemonLog} for details.`,
  );
}
