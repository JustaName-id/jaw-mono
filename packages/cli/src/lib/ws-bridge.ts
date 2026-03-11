/**
 * WSBridge — CLI-side relay client
 *
 * Connects to the cloud relay (wss://relay.jaw.id) instead of a local daemon.
 * All messages (except key_exchange) are E2E encrypted via ECDH + AES-256-GCM.
 */

import * as crypto from "node:crypto";
import type { webcrypto } from "node:crypto";
import WebSocket from "ws";
import {
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
  importKeyFromHex,
  type EncryptedEnvelope,
} from "./crypto.js";

type CKey = webcrypto.CryptoKey;

export interface WSBridgeConfig {
  apiKey: string;
  chainId: number;
  ens?: string;
  paymasterUrl?: string;
}

export interface WSBridgeOptions {
  relayUrl: string;
  session: string;
  timeout?: number;
  config: WSBridgeConfig;
  /** CLI's ECDH private key (hex). Loaded from relay.json for existing sessions. */
  privateKeyHex: string;
  /** CLI's ECDH public key (hex). Sent to browser for key derivation. */
  publicKeyHex: string;
  /** Browser's ECDH public key (hex). Null if new session (key exchange needed). */
  peerPublicKeyHex: string | null;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class WSBridge {
  private readonly relayUrl: string;
  private readonly session: string;
  private readonly timeout: number;
  private readonly config: WSBridgeConfig;
  private readonly privateKeyHex: string;
  readonly publicKeyHex: string;
  private peerPublicKeyHex: string | null;
  private sharedSecret: CKey | null = null;
  private ws: WebSocket | null = null;

  /** Updated after key exchange — caller should persist this. */
  get peerPublicKey(): string | null {
    return this.peerPublicKeyHex;
  }

  constructor(options: WSBridgeOptions) {
    this.relayUrl = options.relayUrl;
    this.session = options.session;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.config = options.config;
    this.privateKeyHex = options.privateKeyHex;
    this.publicKeyHex = options.publicKeyHex;
    this.peerPublicKeyHex = options.peerPublicKeyHex;
  }

  /**
   * Connect to the relay and wait for the browser to be ready.
   *
   * @param onBrowserNeeded — called when the relay reports no browser connected.
   * @param onPeerKeyChanged — called when a key_exchange updates the peer key.
   */
  async connect(
    onBrowserNeeded?: () => Promise<void>,
    onPeerKeyChanged?: (newPeerPublicKeyHex: string) => void,
  ): Promise<void> {
    // Pre-derive shared secret if we already have the peer key
    if (this.peerPublicKeyHex) {
      await this.deriveSecret();
    }

    return new Promise((resolve, reject) => {
      const url = `${this.relayUrl}?session=${encodeURIComponent(this.session)}&role=cli`;
      const ws = new WebSocket(url);

      let browserOpened = false;
      let resolved = false;
      let expectingKeyExchange = !this.peerPublicKeyHex;

      const timer = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            "Browser did not connect in time.\n" +
              "Run `jaw disconnect` then try again.",
          ),
        );
      }, 30_000);

      const sendEncryptedInit = async () => {
        if (!this.sharedSecret) return;
        const envelope = await encryptMessage(this.sharedSecret, {
          type: "init",
          apiKey: this.config.apiKey,
          chainId: this.config.chainId,
          ens: this.config.ens,
          paymasterUrl: this.config.paymasterUrl,
        });
        ws.send(JSON.stringify({ type: "encrypted", ...envelope }));
      };

      const waitForReady = () => {
        const readyTimer = setTimeout(() => {
          ws.close();
          reject(new Error("Browser SDK did not become ready in time."));
        }, 15_000);

        const onMsg = async (data: WebSocket.Data) => {
          const msg = safeParse(data);
          if (!msg) return;

          if (msg.type === "encrypted" && this.sharedSecret) {
            try {
              const inner = await decryptMessage(this.sharedSecret, msg as unknown as EncryptedEnvelope);
              if (inner.type === "ready") {
                clearTimeout(readyTimer);
                ws.off("message", onMsg);
                resolve();
              }
            } catch {
              // Not a valid encrypted message for us, ignore
            }
          }
        };
        ws.on("message", onMsg);
      };

      const onBrowserReady = async () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        // Set up listener BEFORE sending init to avoid missing the ready response
        waitForReady();
        await sendEncryptedInit();
      };

      ws.on("open", () => {
        this.ws = ws;
      });

      ws.on("message", async (data) => {
        const msg = safeParse(data);
        if (!msg) return;

        if (msg.type === "status") {
          if (msg.browserConnected) {
            if (this.sharedSecret) {
              // Already have shared secret — skip key exchange
              await onBrowserReady();
            } else {
              // Browser is connected but we don't have its key yet.
              expectingKeyExchange = true;
            }
          } else if (!browserOpened && onBrowserNeeded) {
            browserOpened = true;
            expectingKeyExchange = true;
            onBrowserNeeded().catch(() => { /* best effort */ });
          }
        } else if (msg.type === "browser_connected") {
          expectingKeyExchange = true;
          // Wait for key_exchange from browser
        } else if (msg.type === "key_exchange" && expectingKeyExchange) {
          expectingKeyExchange = false;
          const peerKey = msg.publicKey as string;
          this.peerPublicKeyHex = peerKey;
          await this.deriveSecret();
          onPeerKeyChanged?.(peerKey);
          await onBrowserReady();
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      ws.on("close", () => {
        clearTimeout(timer);
      });
    });
  }

  /**
   * Send an encrypted RPC request through the relay to the browser SDK.
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to relay");
    }
    if (!this.sharedSecret) {
      throw new Error("No shared secret — key exchange not completed");
    }

    const id = crypto.randomUUID();

    const envelope = await encryptMessage(this.sharedSecret, {
      type: "rpc_request",
      id,
      method,
      params,
    });

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Request timed out after ${this.timeout / 1000}s. ` +
              "Did you complete the action in the browser?",
          ),
        );
        this.close();
      }, this.timeout);

      const onMessage = async (data: WebSocket.Data) => {
        const msg = safeParse(data);
        if (!msg || msg.type !== "encrypted" || !this.sharedSecret) return;

        try {
          const inner = await decryptMessage(this.sharedSecret, msg as unknown as EncryptedEnvelope);
          if (inner.type === "rpc_response" && inner.id === id) {
            clearTimeout(timer);
            ws.off("message", onMessage);

            if (inner.success) {
              resolve(inner.data);
            } else {
              const err = inner.error as
                | { code: number; message: string }
                | undefined;
              reject(
                new Error(
                  err ? `[${err.code}] ${err.message}` : "Request failed",
                ),
              );
            }
          }
        } catch {
          // Decryption failed — not our message or tampered, ignore
        }
      };

      ws.on("message", onMessage);
      ws.send(JSON.stringify({ type: "encrypted", ...envelope }));
    });
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async shutdown(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.sharedSecret) {
      try {
        const envelope = await encryptMessage(this.sharedSecret, {
          type: "shutdown",
        });
        this.ws.send(JSON.stringify({ type: "encrypted", ...envelope }));
      } catch {
        // Best effort
      }
    }
    this.close();
  }

  /**
   * Connect to relay and send shutdown directly — no init/ready handshake.
   * Used by `jaw disconnect` when we just need to tell the browser to close.
   */
  async connectAndShutdown(): Promise<void> {
    if (!this.peerPublicKeyHex) {
      // No peer key means browser never connected — nothing to shut down
      return;
    }

    await this.deriveSecret();

    return new Promise<void>((resolve) => {
      const url = `${this.relayUrl}?session=${encodeURIComponent(this.session)}&role=cli`;
      const ws = new WebSocket(url);

      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        resolve();
      }, 3000);

      ws.on("open", async () => {
        this.ws = ws;
        try {
          await this.shutdown();
        } catch {
          // Best effort
        }
        clearTimeout(timer);
        resolve();
      });

      ws.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  close(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private async deriveSecret(): Promise<void> {
    if (!this.peerPublicKeyHex) return;
    const privateKey = await importKeyFromHex("private", this.privateKeyHex);
    const peerPublicKey = await importKeyFromHex("public", this.peerPublicKeyHex);
    this.sharedSecret = await deriveSharedSecret(privateKey, peerPublicKey);
  }
}

function safeParse(data: WebSocket.Data): Record<string, unknown> | null {
  try {
    return JSON.parse(data.toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
