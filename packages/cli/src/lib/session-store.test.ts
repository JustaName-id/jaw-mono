import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const TEST_ROOT = path.join(os.tmpdir(), "jaw-session-test");
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

vi.mock("./paths.js", () => {
  const p = require("node:path");
  const o = require("node:os");
  const root = p.join(o.tmpdir(), "jaw-session-test");
  return {
    PATHS: {
      root,
      config: p.join(root, "config.json"),
      session: p.join(root, "session.json"),
    },
  };
});

const {
  loadSession,
  saveSession,
  clearSession,
  isSessionValid,
  createSession,
} = await import("./session-store.js");

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

describe("session-store", () => {
  it("loadSession returns null when no session exists", () => {
    expect(loadSession()).toBeNull();
  });

  it("saveSession and loadSession round-trip", () => {
    const session = createSession(VALID_ADDRESS, 8453);
    saveSession(session);
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.address).toBe(VALID_ADDRESS);
    expect(loaded?.chainId).toBe(8453);
  });

  it("clearSession removes session file", () => {
    const session = createSession(VALID_ADDRESS, 1);
    saveSession(session);
    expect(loadSession()).not.toBeNull();
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("isSessionValid returns true for non-expired session", () => {
    const session = createSession(VALID_ADDRESS, 1);
    expect(isSessionValid(session)).toBe(true);
  });

  it("isSessionValid returns false for expired session", () => {
    const session = {
      ...createSession(VALID_ADDRESS, 1),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isSessionValid(session)).toBe(false);
  });

  it("loadSession returns null for expired session", () => {
    const session = {
      ...createSession(VALID_ADDRESS, 1),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    saveSession(session);
    expect(loadSession()).toBeNull();
  });

  it("loadSession returns null for invalid address", () => {
    const session = createSession(VALID_ADDRESS, 1);
    // Write malformed session directly to file
    const sessionPath = path.join(TEST_ROOT, "session.json");
    const malformed = { ...session, address: "not-an-address" };
    fs.writeFileSync(sessionPath, JSON.stringify(malformed));
    expect(loadSession()).toBeNull();
  });
});
