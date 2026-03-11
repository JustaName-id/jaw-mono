/**
 * JAW Relay — Cloudflare Worker + Durable Objects
 *
 * Pairs a CLI daemon and a browser tab via WebSocket so both sides
 * connect outbound to wss://relay.jaw.id (no mixed-content issues).
 *
 * Route: GET /v1/{sessionId}?role=daemon|browser
 * Token: via X-Relay-Token header (daemon) or first WS message (browser)
 * Health: GET /health
 */

export interface Env {
  SESSION: DurableObjectNamespace;
}

// ── Worker entrypoint ──────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    // Route: /v1/{sessionId}
    const match = url.pathname.match(/^\/v1\/([a-zA-Z0-9_-]{1,128})$/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const sessionId = match[1];
    const role = url.searchParams.get("role");

    if (role !== "daemon" && role !== "browser") {
      return new Response("Missing or invalid role (daemon|browser)", {
        status: 400,
      });
    }

    // Each session gets its own Durable Object
    const id = env.SESSION.idFromName(sessionId);
    const stub = env.SESSION.get(id);

    // Forward the upgrade request to the Durable Object
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// ── Durable Object: RelaySession ───────────────────────────────────

const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const MAX_MESSAGE_BYTES = 1_048_576; // 1 MB
const AUTH_TIMEOUT_MS = 10_000; // 10s to authenticate

interface Peer {
  ws: WebSocket;
  role: "daemon" | "browser";
  authenticated: boolean;
}

export class RelaySession implements DurableObject {
  private readonly state: DurableObjectState;
  private peers: Map<string, Peer> = new Map();
  private sessionToken: string | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;

    // Restore session token from storage (survives DO eviction)
    this.state.blockConcurrencyWhile(async () => {
      this.sessionToken =
        (await this.state.storage.get<string>("sessionToken")) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as "daemon" | "browser";
    const headerToken = request.headers.get("X-Relay-Token");

    // Max 2 connections per session (one daemon, one browser)
    if (this.peers.size >= 2) {
      const existing = Array.from(this.peers.values()).find(
        (p) => p.role === role,
      );
      if (!existing) {
        return new Response("Session full", { status: 409 });
      }
    }

    // If token provided via header, validate immediately
    if (headerToken) {
      if (this.sessionToken === null) {
        this.sessionToken = headerToken;
        await this.state.storage.put("sessionToken", headerToken);
        await this.state.storage.setAlarm(Date.now() + SESSION_EXPIRY_MS);
      } else if (this.sessionToken !== headerToken) {
        return new Response("Invalid session token", { status: 403 });
      }
    }

    // WebSocket upgrade
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    // Close any existing peer with the same role
    for (const [id, peer] of this.peers) {
      if (peer.role === role) {
        try {
          peer.ws.close(4000, `Replaced by new ${role}`);
        } catch {
          // ignore
        }
        this.peers.delete(id);
      }
    }

    // Register the new peer
    const peerId = crypto.randomUUID();
    const authenticated = !!headerToken;
    this.peers.set(peerId, { ws: server, role, authenticated });

    // If authenticated via header (daemon), immediately notify + enable forwarding
    if (authenticated) {
      this.notifyPeers(role, "peer_connected");
    }

    // If not authenticated (browser), set a timeout for the auth message
    if (!authenticated) {
      const authTimer = setTimeout(() => {
        const peer = this.findPeer(server);
        if (peer && !peer.authenticated) {
          server.close(4001, "Authentication timeout");
          this.removePeer(server);
        }
      }, AUTH_TIMEOUT_MS);

      // Store timer reference for cleanup
      server.addEventListener("close", () => clearTimeout(authTimer), {
        once: true,
      });
    }

    // Set up event listeners
    server.addEventListener("message", (event) => {
      const message = event.data;
      const size =
        typeof message === "string"
          ? message.length
          : (message as ArrayBuffer).byteLength;
      if (size > MAX_MESSAGE_BYTES) {
        server.close(4003, "Message too large");
        return;
      }

      const peer = this.findPeer(server);
      if (!peer) return;

      // Handle auth message from unauthenticated peers (browser)
      if (!peer.authenticated && typeof message === "string") {
        try {
          const msg = JSON.parse(message) as Record<string, unknown>;
          if (msg.type === "auth" && typeof msg.token === "string") {
            this.handleAuth(peer, msg.token as string);
            return;
          }
        } catch {
          // Not valid auth message
        }
        // Unauthenticated peer sent non-auth message — reject
        server.close(4001, "Not authenticated");
        this.removePeer(server);
        return;
      }

      // Authenticated — forward to the other peer
      const targetRole = peer.role === "daemon" ? "browser" : "daemon";
      for (const [, p] of this.peers) {
        if (p.role === targetRole && p.authenticated) {
          try {
            p.ws.send(message);
          } catch {
            // Peer disconnected
          }
          return;
        }
      }

      // No peer to forward to
      if (typeof message === "string") {
        try {
          const parsed = JSON.parse(message) as Record<string, unknown>;
          if (parsed.id && parsed.type === "rpc_request") {
            server.send(
              JSON.stringify({
                id: parsed.id,
                type: "rpc_response",
                success: false,
                error: {
                  code: -32001,
                  message: `Peer (${targetRole}) not connected`,
                },
              }),
            );
          }
        } catch {
          // ignore
        }
      }
    });

    server.addEventListener("close", async () => {
      const peer = this.removePeer(server);
      if (peer) {
        this.notifyPeers(peer.role, "peer_disconnected");
      }
      if (this.peers.size === 0) {
        await this.state.storage.setAlarm(Date.now() + 60_000);
      }
    });

    server.addEventListener("error", () => {
      const peer = this.removePeer(server);
      if (peer) {
        this.notifyPeers(peer.role, "peer_disconnected");
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    for (const [, peer] of this.peers) {
      try {
        peer.ws.close(4004, "Session expired");
      } catch {
        // ignore
      }
    }
    this.peers.clear();
    this.sessionToken = null;
    await this.state.storage.deleteAll();
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async handleAuth(peer: Peer, token: string): Promise<void> {
    if (this.sessionToken === null) {
      this.sessionToken = token;
      await this.state.storage.put("sessionToken", token);
      await this.state.storage.setAlarm(Date.now() + SESSION_EXPIRY_MS);
    } else if (this.sessionToken !== token) {
      peer.ws.close(4001, "Invalid token");
      this.removePeer(peer.ws);
      return;
    }

    peer.authenticated = true;
    this.notifyPeers(peer.role, "peer_connected");
  }

  private findPeer(ws: WebSocket): Peer | undefined {
    for (const [, peer] of this.peers) {
      if (peer.ws === ws) return peer;
    }
    return undefined;
  }

  private removePeer(ws: WebSocket): Peer | undefined {
    for (const [id, peer] of this.peers) {
      if (peer.ws === ws) {
        this.peers.delete(id);
        return peer;
      }
    }
    return undefined;
  }

  private notifyPeers(aboutRole: string, event: string): void {
    const msg = JSON.stringify({ type: event, role: aboutRole });
    for (const [, peer] of this.peers) {
      if (peer.role !== aboutRole && peer.authenticated) {
        try {
          peer.ws.send(msg);
        } catch {
          // ignore
        }
      }
    }
  }
}
