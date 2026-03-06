import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const TEST_ROOT = path.join(os.tmpdir(), "jaw-communicator-test");

vi.mock("./paths.js", () => {
  const p = require("node:path");
  const o = require("node:os");
  const root = p.join(o.tmpdir(), "jaw-communicator-test");
  return {
    PATHS: {
      root,
      config: p.join(root, "config.json"),
      session: p.join(root, "session.json"),
    },
  };
});

// Mock `open` to prevent actual browser opening
vi.mock("open", () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

const { CLICommunicator } = await import("./cli-communicator.js");

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  // Write a config so loadConfig doesn't fail
  fs.writeFileSync(
    path.join(TEST_ROOT, "config.json"),
    JSON.stringify({ keysUrl: "https://keys.jaw.id" }),
  );
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

describe("CLICommunicator", () => {
  it("constructs with required options", () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://keys.jaw.id",
    });
    expect(comm).toBeDefined();
  });

  it("rejects untrusted keysUrl", async () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://evil.com",
      timeout: 1000,
    });

    await expect(comm.request("wallet_connect")).rejects.toThrow(
      "Untrusted keysUrl",
    );
  });

  it("accepts localhost keysUrl", async () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "http://localhost:3000",
      timeout: 2000,
    });

    // This will timeout (no browser to respond), but should NOT throw untrusted URL
    const promise = comm.request("wallet_connect");

    // Give it a moment to start server and try to open browser
    await new Promise((r) => setTimeout(r, 100));

    // The open mock was called, so URL was accepted
    const { default: open } = await import("open");
    expect(open).toHaveBeenCalled();
    const calledUrl = (open as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as string;
    expect(calledUrl).toContain("localhost:3000");
    expect(calledUrl).toContain("cli-bridge");
    expect(calledUrl).toContain("#apiKey="); // API key in fragment

    // Clean up — let it timeout
    await expect(promise).rejects.toThrow("timed out");
  });

  it("accepts *.jaw.id keysUrl", () => {
    // Should not throw during construction
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://staging.keys.jaw.id",
    });
    expect(comm).toBeDefined();
  });

  it("callback server accepts valid POST and returns result", async () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://keys.jaw.id",
      timeout: 5000,
    });

    // Start request (opens browser mock, starts callback server)
    const resultPromise = comm.request("wallet_connect");

    // Wait for server to start
    await new Promise((r) => setTimeout(r, 200));

    // Extract callback URL from the open mock
    const { default: open } = await import("open");
    const calledUrl = (open as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as string;
    const parsedUrl = new URL(calledUrl);
    const callbackUrl = parsedUrl.searchParams.get("callback")!;
    const requestId = parsedUrl.searchParams.get("requestId")!;

    // POST result to callback server
    const payload = JSON.stringify({
      requestId,
      success: true,
      data: [VALID_ADDRESS],
    });

    const callbackParsed = new URL(callbackUrl);
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: callbackParsed.hostname,
          port: callbackParsed.port,
          path: callbackParsed.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => {
            expect(res.statusCode).toBe(200);
            resolve();
          });
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    const result = await resultPromise;
    expect(result).toEqual([VALID_ADDRESS]);
  });

  it("callback server rejects mismatched requestId", async () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://keys.jaw.id",
      timeout: 2000,
    });

    const resultPromise = comm.request("personal_sign", "hello");

    await new Promise((r) => setTimeout(r, 200));

    const { default: open } = await import("open");
    const calledUrl = (open as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as string;
    const parsedUrl = new URL(calledUrl);
    const callbackUrl = parsedUrl.searchParams.get("callback")!;

    // POST with wrong requestId
    const payload = JSON.stringify({
      requestId: "wrong-id",
      success: true,
      data: "0xsig",
    });

    const callbackParsed = new URL(callbackUrl);
    const statusCode = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: callbackParsed.hostname,
          port: callbackParsed.port,
          path: callbackParsed.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    expect(statusCode).toBe(400);

    // Clean up by letting it timeout
    await expect(resultPromise).rejects.toThrow("timed out");
  }, 10000);

  it("returns error data when success is false", async () => {
    const comm = new CLICommunicator({
      apiKey: "test-key",
      keysUrl: "https://keys.jaw.id",
      timeout: 5000,
    });

    const resultPromise = comm.request("wallet_sendCalls", {
      calls: [],
    });
    // Attach a no-op catch to prevent unhandled rejection warning
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    resultPromise.catch(() => {});

    await new Promise((r) => setTimeout(r, 200));

    const { default: open } = await import("open");
    const calledUrl = (open as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[0] as string;
    const parsedUrl = new URL(calledUrl);
    const callbackUrl = parsedUrl.searchParams.get("callback")!;
    const requestId = parsedUrl.searchParams.get("requestId")!;

    const payload = JSON.stringify({
      requestId,
      success: false,
      error: { code: 4001, message: "User rejected" },
    });

    const callbackParsed = new URL(callbackUrl);
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: callbackParsed.hostname,
          port: callbackParsed.port,
          path: callbackParsed.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve());
        },
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    // Wait a tick for the promise to settle before asserting
    await new Promise((r) => setTimeout(r, 50));
    await expect(resultPromise).rejects.toThrow("[4001] User rejected");
  });
});

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
