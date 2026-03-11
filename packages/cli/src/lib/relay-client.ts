/**
 * RelayConnection — Daemon-side WSS client to the cloud relay.
 *
 * Connects to wss://relay.jaw.id/v1/{session}?role=daemon&token={token}
 * and forwards messages bidirectionally between the relay and the daemon.
 */

import WebSocket from "ws";

export interface RelayConnectionOptions {
  relayUrl: string;
  sessionId: string;
  token: string;
  onMessage: (data: string) => void;
  onPeerConnected: () => void;
  onPeerDisconnected: () => void;
  onClose: () => void;
  onError: (err: Error) => void;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1_000;
const PING_INTERVAL_MS = 25_000;

export class RelayConnection {
  private readonly options: RelayConnectionOptions;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private closed = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: RelayConnectionOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.closed) return;

    const url = `${this.options.relayUrl}/v1/${this.options.sessionId}?role=daemon`;

    return new Promise<void>((resolve, reject) => {
      // Pass token via header — not logged in CF access logs (unlike query params)
      const ws = new WebSocket(url, {
        headers: { "X-Relay-Token": this.options.token },
      });

      const connectTimer = setTimeout(() => {
        ws.close();
        reject(new Error("Relay connection timed out"));
      }, 15_000);

      ws.on("open", () => {
        clearTimeout(connectTimer);
        this.ws = ws;
        this.reconnectAttempts = 0;
        this.startPing();
        resolve();
      });

      ws.on("message", (data) => {
        const str = data.toString();

        // Handle relay control messages
        try {
          const msg = JSON.parse(str) as Record<string, unknown>;
          if (msg.type === "peer_connected" && msg.role === "browser") {
            this.options.onPeerConnected();
            return;
          }
          if (msg.type === "peer_disconnected" && msg.role === "browser") {
            this.options.onPeerDisconnected();
            return;
          }
        } catch {
          // Not JSON — forward as-is
        }

        this.options.onMessage(str);
      });

      ws.on("close", () => {
        clearTimeout(connectTimer);
        this.stopPing();
        this.ws = null;

        if (!this.closed) {
          // Try reconnect — only call onClose after all attempts exhausted
          this.tryReconnect();
        } else {
          this.options.onClose();
        }
      });

      ws.on("error", (err) => {
        clearTimeout(connectTimer);
        if (!this.ws) {
          reject(err);
        }
        this.options.onError(err);
      });
    });
  }

  send(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.close(1000, "Daemon shutdown");
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private tryReconnect(): void {
    if (this.closed || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      // All attempts exhausted — now notify the daemon
      this.options.onClose();
      return;
    }

    this.reconnectAttempts++;
    const backoff =
      INITIAL_BACKOFF_MS * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      if (!this.closed) {
        this.connect().catch(() => {
          // Reconnect failed — will try again from the close handler
        });
      }
    }, backoff);
  }
}
