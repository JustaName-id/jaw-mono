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
import { spawn } from "node:child_process";
import { PATHS } from "./paths.js";
import { ensureDir } from "./config.js";
import { WSBridge } from "./ws-bridge.js";
import { loadConfig } from "./config.js";

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

function loadBridgeInfo(): BridgeInfo | null {
  try {
    if (!fs.existsSync(PATHS.bridge)) return null;
    const raw = fs.readFileSync(PATHS.bridge, "utf-8");
    const info = JSON.parse(raw) as BridgeInfo;
    // Check if daemon process is still alive
    try {
      process.kill(info.pid, 0);
      return info;
    } catch {
      // Process is dead, clean up stale file
      fs.unlinkSync(PATHS.bridge);
      return null;
    }
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

  const daemonArgs = {
    keysUrl: options.keysUrl ?? config.keysUrl ?? JAW_KEYS_URL,
    apiKey: options.apiKey,
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

  const logFd = fs.openSync(PATHS.daemonLog, "w");
  const child = spawn(process.execPath, [daemonScript, JSON.stringify(daemonArgs)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
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
