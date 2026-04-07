/**
 * Bridge lifecycle management — relay edition.
 *
 * - Generates a session token + ECDH keypair for new sessions
 * - Opens the browser to keys.jaw.id/cli-bridge
 * - Saves relay state to ~/.jaw/relay.json
 * - Creates a WSBridge client connected to the relay
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { PATHS } from './paths.js';
import { ensureDir, loadConfig } from './config.js';
import { WSBridge } from './ws-bridge.js';
import { isValidKeysUrl, isValidRelayUrl } from './validation.js';
import { generateKeyPair, exportKeyToHex } from './crypto.js';

const DEFAULT_KEYS_URL = 'https://keys.jaw.id';
const DEFAULT_RELAY_URL = 'wss://relay.jaw.id';

interface RelaySession {
  session: string;
  relayUrl: string;
  privateKey: string;
  publicKey: string;
  peerPublicKey: string | null;
  startedAt: string;
}

export interface BridgeOptions {
  keysUrl?: string;
  relayUrl?: string;
  apiKey: string;
  chainId?: number;
  ens?: string;
  paymasterUrl?: string;
  timeout?: number;
}

function loadRelaySession(): RelaySession | null {
  try {
    if (!fs.existsSync(PATHS.relay)) return null;
    const raw = fs.readFileSync(PATHS.relay, 'utf-8');
    const parsed = JSON.parse(raw) as RelaySession;
    // Basic validation
    if (!parsed.session || !parsed.relayUrl || !parsed.privateKey || !parsed.publicKey) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveRelaySession(info: RelaySession): void {
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.relay, JSON.stringify(info, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function deleteRelaySession(): void {
  try {
    if (fs.existsSync(PATHS.relay)) fs.unlinkSync(PATHS.relay);
  } catch {
    // ignore
  }
}

/**
 * Get or create a relay bridge connection.
 */
export async function getBridge(options: BridgeOptions): Promise<WSBridge> {
  const config = loadConfig();
  const keysUrl = options.keysUrl ?? config.keysUrl ?? DEFAULT_KEYS_URL;
  const relayUrl = options.relayUrl ?? config.relayUrl ?? DEFAULT_RELAY_URL;
  const chainId = options.chainId ?? config.defaultChain ?? 1;
  if (!isValidKeysUrl(keysUrl)) {
    throw new Error(`Untrusted keysUrl: ${keysUrl}. Must be a *.jaw.id domain (HTTPS) or localhost.`);
  }
  if (!isValidRelayUrl(relayUrl)) {
    throw new Error(`Untrusted relayUrl: ${relayUrl}. Must be wss://*.jaw.id or ws://localhost.`);
  }

  // Try existing session first
  let relaySession = loadRelaySession();
  if (relaySession && relaySession.relayUrl === relayUrl) {
    try {
      return await connectBridge(relaySession, options, chainId, keysUrl, relayUrl);
    } catch {
      // Connection failed — stale session or relay restarted.
      // Delete and fall through to create a new one.
      deleteRelaySession();
      relaySession = null;
    }
  }

  // New session
  const session = await createNewSession(relayUrl);
  saveRelaySession(session);
  return await connectBridge(session, options, chainId, keysUrl, relayUrl);
}

async function createNewSession(relayUrl: string): Promise<RelaySession> {
  const kp = await generateKeyPair();
  const privateKey = await exportKeyToHex('private', kp.privateKey);
  const publicKey = await exportKeyToHex('public', kp.publicKey);

  return {
    session: crypto.randomUUID(),
    relayUrl,
    privateKey,
    publicKey,
    peerPublicKey: null,
    startedAt: new Date().toISOString(),
  };
}

async function connectBridge(
  relaySession: RelaySession,
  options: BridgeOptions,
  chainId: number,
  keysUrl: string,
  relayUrl: string
): Promise<WSBridge> {
  const config = loadConfig();
  const bridge = new WSBridge({
    relayUrl,
    session: relaySession.session,
    timeout: options.timeout,
    config: {
      apiKey: options.apiKey,
      chainId,
      ens: options.ens ?? config.ens,
      paymasterUrl: options.paymasterUrl ?? config.paymasterUrl,
    },
    privateKeyHex: relaySession.privateKey,
    publicKeyHex: relaySession.publicKey,
    peerPublicKeyHex: relaySession.peerPublicKey,
  });

  await bridge.connect(
    // onBrowserNeeded
    async () => {
      const bridgeUrl = buildBridgeUrl(keysUrl, relaySession.session, relayUrl, relaySession.publicKey);
      const { default: open } = await import('open');
      await open(bridgeUrl);
    },
    // onPeerKeyChanged
    (newPeerKey) => {
      relaySession.peerPublicKey = newPeerKey;
      saveRelaySession(relaySession);
    }
  );

  return bridge;
}

function buildBridgeUrl(keysUrl: string, session: string, relayUrl: string, cliPublicKeyHex: string): string {
  const url = new URL('/cli-bridge', keysUrl);
  url.searchParams.set('session', session);
  url.searchParams.set('relay', relayUrl);
  // CLI public key in fragment — not sent to server
  url.hash = `pk=${cliPublicKeyHex}`;
  return url.toString();
}

/**
 * Shutdown: close the relay session and clean up.
 */
export async function shutdownDaemon(): Promise<void> {
  const session = loadRelaySession();
  if (!session) return;

  // Send shutdown directly — no init/ready handshake needed
  try {
    const bridge = new WSBridge({
      relayUrl: session.relayUrl,
      session: session.session,
      timeout: 5000,
      config: { apiKey: '', chainId: 1 },
      privateKeyHex: session.privateKey,
      publicKeyHex: session.publicKey,
      peerPublicKeyHex: session.peerPublicKey,
    });
    await bridge.connectAndShutdown();
  } catch {
    // Best effort — relay or browser may already be gone
  }

  deleteRelaySession();

  // Legacy cleanup: kill old daemon process and remove files
  const legacyBridge = PATHS.root + '/bridge.json';
  const legacyLog = PATHS.root + '/daemon.log';
  const legacyLock = PATHS.root + '/daemon.lock';
  try {
    if (fs.existsSync(legacyBridge)) {
      const info = JSON.parse(fs.readFileSync(legacyBridge, 'utf-8'));
      if (info.pid && Number.isInteger(info.pid) && info.pid > 0) {
        try {
          process.kill(info.pid, 'SIGTERM');
        } catch {
          /* already dead */
        }
      }
    }
  } catch {
    /* ignore */
  }
  for (const f of [legacyBridge, legacyLog, legacyLock]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* ignore */
    }
  }
}
