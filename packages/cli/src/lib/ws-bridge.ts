/**
 * WSBridge — CLI-side client
 *
 * Lightweight WebSocket client that connects to the background daemon.
 * Each CLI command creates a WSBridge, sends one request, and exits.
 * The daemon (and browser SDK) stay alive across commands.
 */

import * as crypto from "node:crypto";
import WebSocket from "ws";

export interface WSBridgeOptions {
  port: number;
  token: string;
  timeout?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class WSBridge {
  private readonly port: number;
  private readonly token: string;
  private readonly timeout: number;
  private ws: WebSocket | null = null;

  constructor(options: WSBridgeOptions) {
    this.port = options.port;
    this.token = options.token;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Connect to the daemon's WebSocket server.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}?token=${encodeURIComponent(this.token)}&role=cli`;
      const ws = new WebSocket(url);

      const timer = setTimeout(() => {
        ws.close();
        reject(
          new Error(
            "Browser SDK not connected. The browser tab may have been closed.\n" +
              "Run `jaw disconnect` then try again to open a new browser session.",
          ),
        );
      }, 30_000);

      ws.on("open", () => {
        clearTimeout(timer);
        this.ws = ws;
      });

      ws.on("message", (data) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data.toString()) as Record<string, unknown>;
        } catch {
          return;
        }
        // Wait for the status message confirming daemon is ready.
        // If browser isn't connected yet, stay connected and wait for
        // a "browser_connected" event (the daemon notifies CLI clients
        // when the browser joins).
        if (msg.type === "status" && msg.browserConnected) {
          clearTimeout(timer);
          resolve();
        } else if (msg.type === "browser_connected") {
          clearTimeout(timer);
          resolve();
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
   * Send an RPC request through the daemon to the browser SDK.
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to bridge daemon");
    }

    const id = crypto.randomUUID();

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

      const onMessage = (data: WebSocket.Data) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(data.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === "rpc_response" && msg.id === id) {
          clearTimeout(timer);
          ws.off("message", onMessage);

          if (msg.success) {
            resolve(msg.data);
          } else {
            const err = msg.error as
              | { code: number; message: string }
              | undefined;
            reject(
              new Error(
                err ? `[${err.code}] ${err.message}` : "Request failed",
              ),
            );
          }
        }
      };

      ws.on("message", onMessage);

      ws.send(
        JSON.stringify({
          id,
          type: "rpc_request",
          method,
          params,
        }),
      );
    });
  }

  /**
   * Send a shutdown signal to the daemon.
   */
  shutdown(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "shutdown" }));
    }
    this.close();
  }

  /**
   * Close the client connection (daemon stays alive).
   */
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
}
