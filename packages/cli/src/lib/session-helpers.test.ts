import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const TEST_ROOT = path.join(os.tmpdir(), "jaw-session-helpers-test");
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

vi.mock("./paths.js", () => {
  const p = require("node:path");
  const o = require("node:os");
  const root = p.join(o.tmpdir(), "jaw-session-helpers-test");
  return {
    PATHS: {
      root,
      config: p.join(root, "config.json"),
      session: p.join(root, "session.json"),
    },
  };
});

const { handleLocalOnly, maybeSaveSession, extractAddress } =
  await import("./session-helpers.js");
const { loadSession } = await import("./session-store.js");

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

describe("extractAddress", () => {
  it("extracts from array result", () => {
    expect(extractAddress([VALID_ADDRESS])).toBe(VALID_ADDRESS);
  });

  it("extracts from object with address field", () => {
    expect(extractAddress({ address: VALID_ADDRESS })).toBe(VALID_ADDRESS);
  });

  it("returns undefined for invalid address in array", () => {
    expect(extractAddress(["not-an-address"])).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(extractAddress([])).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(extractAddress(null)).toBeUndefined();
  });

  it("returns undefined for string (non-array, non-object)", () => {
    expect(extractAddress(VALID_ADDRESS)).toBeUndefined();
  });

  it("returns undefined for short address", () => {
    expect(extractAddress(["0x1234"])).toBeUndefined();
  });

  it("extracts from accounts array with address objects", () => {
    expect(extractAddress({ accounts: [{ address: VALID_ADDRESS }] })).toBe(
      VALID_ADDRESS,
    );
  });

  it("extracts from accounts array with string addresses", () => {
    expect(extractAddress({ accounts: [VALID_ADDRESS] })).toBe(VALID_ADDRESS);
  });

  it("returns undefined for empty accounts array", () => {
    expect(extractAddress({ accounts: [] })).toBeUndefined();
  });
});

describe("handleLocalOnly", () => {
  it("wallet_disconnect clears session and returns success", () => {
    // Write a session file first
    const session = {
      address: VALID_ADDRESS,
      chainId: 1,
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    fs.writeFileSync(
      path.join(TEST_ROOT, "session.json"),
      JSON.stringify(session),
    );
    expect(loadSession()).not.toBeNull();

    const result = handleLocalOnly("wallet_disconnect");
    expect(result).toEqual({ success: true });
    expect(loadSession()).toBeNull();
  });

  it("throws for unknown local-only method", () => {
    expect(() => handleLocalOnly("unknown_method")).toThrow(
      "Unhandled local-only method",
    );
  });

  it("wallet_switchEthereumChain updates session chainId", () => {
    const session = {
      address: VALID_ADDRESS,
      chainId: 1,
      connectedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    fs.writeFileSync(
      path.join(TEST_ROOT, "session.json"),
      JSON.stringify(session),
    );

    const result = handleLocalOnly("wallet_switchEthereumChain", [
      { chainId: "0x2105" },
    ]);
    expect(result).toBeNull();
    const updated = loadSession();
    expect(updated?.chainId).toBe(0x2105);
    expect(updated?.address).toBe(VALID_ADDRESS);
  });

  it("wallet_switchEthereumChain throws without params", () => {
    expect(() => handleLocalOnly("wallet_switchEthereumChain")).toThrow(
      "requires params",
    );
  });

  it("wallet_switchEthereumChain works with no active session", () => {
    const result = handleLocalOnly("wallet_switchEthereumChain", [
      { chainId: "0x1" },
    ]);
    expect(result).toBeNull();
  });
});

describe("maybeSaveSession", () => {
  it("saves session after wallet_connect with array result", () => {
    // Need config file for defaultChain
    fs.writeFileSync(
      path.join(TEST_ROOT, "config.json"),
      JSON.stringify({ defaultChain: 8453 }),
    );

    maybeSaveSession("wallet_connect", [VALID_ADDRESS]);
    const session = loadSession();
    expect(session).not.toBeNull();
    expect(session?.address).toBe(VALID_ADDRESS);
    expect(session?.chainId).toBe(8453);
  });

  it("saves session after eth_requestAccounts", () => {
    fs.writeFileSync(path.join(TEST_ROOT, "config.json"), JSON.stringify({}));

    maybeSaveSession("eth_requestAccounts", [VALID_ADDRESS]);
    const session = loadSession();
    expect(session).not.toBeNull();
    expect(session?.address).toBe(VALID_ADDRESS);
    expect(session?.chainId).toBe(1); // default
  });

  it("uses chainId override when provided", () => {
    fs.writeFileSync(
      path.join(TEST_ROOT, "config.json"),
      JSON.stringify({ defaultChain: 1 }),
    );

    maybeSaveSession("wallet_connect", [VALID_ADDRESS], 42161);
    const session = loadSession();
    expect(session?.chainId).toBe(42161);
  });

  it("does nothing for non-connect methods", () => {
    maybeSaveSession("personal_sign", [VALID_ADDRESS]);
    expect(loadSession()).toBeNull();
  });

  it("does nothing for invalid address in result", () => {
    fs.writeFileSync(path.join(TEST_ROOT, "config.json"), JSON.stringify({}));

    maybeSaveSession("wallet_connect", ["not-valid"]);
    expect(loadSession()).toBeNull();
  });

  it("saves session from object result with address field", () => {
    fs.writeFileSync(path.join(TEST_ROOT, "config.json"), JSON.stringify({}));

    maybeSaveSession("wallet_connect", { address: VALID_ADDRESS });
    const session = loadSession();
    expect(session).not.toBeNull();
    expect(session?.address).toBe(VALID_ADDRESS);
  });
});
