import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const TEST_ROOT = path.join(os.tmpdir(), "jaw-config-test");

vi.mock("./paths.js", () => {
  const p = require("node:path");
  const o = require("node:os");
  const root = p.join(o.tmpdir(), "jaw-config-test");
  return {
    PATHS: {
      root,
      config: p.join(root, "config.json"),
      session: p.join(root, "session.json"),
    },
  };
});

const { loadConfig, saveConfig, initConfig, getConfigValue, setConfigValue } =
  await import("./config.js");
const { PATHS } = await import("./paths.js");

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

describe("config", () => {
  it("loadConfig returns empty object when no config exists", () => {
    expect(loadConfig()).toEqual({});
  });

  it("saveConfig creates config file", () => {
    saveConfig({ apiKey: "test-key", defaultChain: 8453 });
    const saved = loadConfig();
    expect(saved.apiKey).toBe("test-key");
    expect(saved.defaultChain).toBe(8453);
  });

  it("initConfig creates directories and merges config", () => {
    const config = initConfig({ apiKey: "init-key" });
    expect(config.apiKey).toBe("init-key");
    expect(fs.existsSync(PATHS.root)).toBe(true);
  });

  it("initConfig merges with existing config", () => {
    initConfig({ apiKey: "first" });
    const config = initConfig({ defaultChain: 1 });
    expect(config.apiKey).toBe("first");
    expect(config.defaultChain).toBe(1);
  });

  it("getConfigValue returns specific value", () => {
    saveConfig({ apiKey: "my-key", defaultChain: 42 });
    expect(getConfigValue("apiKey")).toBe("my-key");
    expect(getConfigValue("defaultChain")).toBe(42);
  });

  it("setConfigValue updates a single value", () => {
    saveConfig({ apiKey: "old-key" });
    setConfigValue("apiKey", "new-key");
    expect(loadConfig().apiKey).toBe("new-key");
  });
});
