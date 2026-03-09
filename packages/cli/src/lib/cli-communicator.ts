/**
 * CLICommunicator
 *
 * Replaces the browser-based Communicator (postMessage) with a local HTTP
 * server callback pattern. Same approach as `gh auth login`, `firebase login`.
 *
 * Flow:
 * 1. Start HTTP server on 127.0.0.1:{random_port}
 * 2. Open browser to keys.jaw.id/cli-bridge with callback URL + request params
 * 3. Bridge page opens keys.jaw.id popup (standard postMessage flow)
 * 4. User signs with passkey in popup
 * 5. Bridge receives postMessage response, POSTs to our callback
 * 6. CLI receives result, closes server
 */

import * as http from "node:http";
import * as crypto from "node:crypto";
import { loadConfig } from "./config.js";

const JAW_KEYS_URL = "https://keys.jaw.id";
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes
const CALLBACK_PATH = "/callback";

export interface CLICommunicatorOptions {
  keysUrl?: string;
  apiKey: string;
  chainId?: number;
  timeout?: number;
  headless?: boolean;
  onDisplayCode?: (userCode: string, verificationUrl: string) => void;
}

interface CallbackResult {
  success: boolean;
  data?: unknown;
  error?: { code: number; message: string };
}

/**
 * Opens a browser to keys.jaw.id and receives the result via local HTTP callback.
 */
export class CLICommunicator {
  private readonly keysUrl: string;
  private readonly apiKey: string;
  private readonly chainId: number;
  private readonly timeout: number;
  private readonly headless: boolean;
  private readonly onDisplayCode?: (
    userCode: string,
    verificationUrl: string,
  ) => void;

  constructor(options: CLICommunicatorOptions) {
    this.keysUrl = options.keysUrl ?? loadConfig().keysUrl ?? JAW_KEYS_URL;
    this.apiKey = options.apiKey;
    this.chainId = options.chainId ?? loadConfig().defaultChain ?? 1;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.headless = options.headless ?? false;
    this.onDisplayCode = options.onDisplayCode;
  }

  /**
   * Send an RPC request through the browser flow.
   * Opens browser → user signs → result comes back via HTTP callback.
   */
  async request(method: string, params?: unknown): Promise<unknown> {
    // Use device code flow for headless environments
    if (this.headless) {
      return this.requestViaDeviceCode(method, params);
    }

    const requestId = crypto.randomUUID();
    const { port, resultPromise, close } =
      await this.startCallbackServer(requestId);

    try {
      const callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

      const bridgeUrl = this.buildBridgeUrl({
        callbackUrl,
        requestId,
        method,
        params,
      });

      // Dynamically import `open` (ESM-only package)
      const { default: open } = await import("open");
      await open(bridgeUrl);

      // Wait for callback with timeout
      const result = await Promise.race([resultPromise, this.createTimeout()]);

      if (!result.success) {
        const errMsg = result.error?.message ?? "Request failed in browser";
        const errCode = result.error?.code ?? -32000;
        throw new Error(`[${errCode}] ${errMsg}`);
      }

      return result.data;
    } finally {
      close();
    }
  }

  private async requestViaDeviceCode(
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const { deviceCodeFlow } = await import("./device-code.js");
    return deviceCodeFlow({
      keysUrl: this.keysUrl,
      method,
      params,
      apiKey: this.apiKey,
      timeout: this.timeout,
      onDisplayCode: this.onDisplayCode,
    });
  }

  private buildBridgeUrl(opts: {
    callbackUrl: string;
    requestId: string;
    method: string;
    params?: unknown;
  }): string {
    // Validate keysUrl is a trusted JAW domain
    const parsedKeysUrl = new URL(this.keysUrl);
    if (
      !parsedKeysUrl.hostname.endsWith(".jaw.id") &&
      parsedKeysUrl.hostname !== "jaw.id" &&
      parsedKeysUrl.hostname !== "localhost" &&
      parsedKeysUrl.hostname !== "127.0.0.1"
    ) {
      throw new Error(
        `Untrusted keysUrl: ${this.keysUrl}. Must be a *.jaw.id domain or localhost.`,
      );
    }

    const url = new URL("/cli-bridge", this.keysUrl);
    url.searchParams.set("callback", opts.callbackUrl);
    url.searchParams.set("requestId", opts.requestId);
    url.searchParams.set("method", opts.method);
    url.searchParams.set("chainId", String(this.chainId));
    // API key sent via fragment to avoid browser history/server logs
    if (opts.params !== undefined) {
      url.searchParams.set("params", JSON.stringify(opts.params));
    }
    url.hash = `apiKey=${encodeURIComponent(this.apiKey)}`;
    return url.toString();
  }

  /**
   * Starts a local HTTP server that waits for the callback POST from the bridge page.
   */
  private startCallbackServer(requestId: string): Promise<{
    port: number;
    resultPromise: Promise<CallbackResult>;
    close: () => void;
  }> {
    return new Promise((resolveServer, rejectServer) => {
      let resolveResult: (result: CallbackResult) => void;
      const resultPromise = new Promise<CallbackResult>((r) => {
        resolveResult = r;
      });

      const allowedOrigin = this.keysUrl;

      const corsHeaders = {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      const server = http.createServer((req, res) => {
        // CORS preflight
        if (req.method === "OPTIONS") {
          res.writeHead(204, corsHeaders);
          res.end();
          return;
        }

        // Only accept POST to /callback
        if (req.method !== "POST" || !req.url?.startsWith(CALLBACK_PATH)) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        let body = "";
        let tooLarge = false;
        req.on("data", (chunk: Buffer) => {
          if (tooLarge) return;
          body += chunk.toString();
          if (body.length > 1_048_576) {
            tooLarge = true;
            res.writeHead(413);
            res.end("Payload too large");
            req.socket.destroy();
          }
        });

        req.on("end", () => {
          if (tooLarge) return;

          try {
            const parsed = JSON.parse(body) as CallbackResult & {
              requestId?: string;
            };

            // Validate requestId matches
            if (parsed.requestId !== requestId) {
              res.writeHead(400, {
                "Content-Type": "text/html",
                ...corsHeaders,
              });
              res.end("<html><body><h2>Invalid request ID</h2></body></html>");
              return;
            }

            // Send success page to browser
            res.writeHead(200, {
              "Content-Type": "text/html",
              ...corsHeaders,
            });
            res.end(SUCCESS_HTML);

            resolveResult({
              success: parsed.success,
              data: parsed.data,
              error: parsed.error,
            });
          } catch {
            res.writeHead(400, {
              "Content-Type": "text/html",
              ...corsHeaders,
            });
            res.end("<html><body><h2>Invalid response</h2></body></html>");

            // Resolve with error so CLI doesn't hang until timeout
            resolveResult({
              success: false,
              error: { code: -32700, message: "Invalid callback response" },
            });
          }
        });
      });

      // Listen only on loopback
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          rejectServer(new Error("Failed to start callback server"));
          return;
        }
        resolveServer({
          port: addr.port,
          resultPromise,
          close: () => {
            server.close();
          },
        });
      });

      server.on("error", (err) => {
        rejectServer(err);
      });
    });
  }

  private createTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Request timed out after ${this.timeout / 1000}s. ` +
              "Did you complete the action in the browser?",
          ),
        );
      }, this.timeout);
      timer.unref();
    });
  }
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>JAW CLI</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #fafafa; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Success</h1>
    <p>You can close this tab and return to your terminal.</p>
  </div>
  <script>setTimeout(() => window.close(), 2000);</script>
</body>
</html>`;
