import * as fs from "node:fs";
import { PATHS } from "./paths.js";
import type { JawConfig } from "./types.js";
import { isValidKeysUrl } from "./validation.js";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

export function loadConfig(): JawConfig {
  if (!fs.existsSync(PATHS.config)) {
    return {};
  }
  const raw = fs.readFileSync(PATHS.config, "utf-8");
  try {
    return JSON.parse(raw) as JawConfig;
  } catch {
    throw new Error(
      `Config file at ${PATHS.config} is not valid JSON. Run \`jaw config init\` to reset it.`,
    );
  }
}

export function saveConfig(config: JawConfig): void {
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.config, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function redactConfig(config: JawConfig): Record<string, unknown> {
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...` : undefined,
  };
}

export function initConfig(overrides: Partial<JawConfig> = {}): JawConfig {
  ensureDir(PATHS.root);

  const existing = loadConfig();
  const merged: JawConfig = { ...existing, ...overrides };
  saveConfig(merged);
  return merged;
}

export function getConfigValue(
  key: keyof JawConfig,
): string | number | undefined {
  const config = loadConfig();
  return config[key];
}

export function setConfigValue(
  key: keyof JawConfig,
  value: string | number,
): void {
  if (
    key === "keysUrl" &&
    typeof value === "string" &&
    !isValidKeysUrl(value)
  ) {
    throw new Error(
      `Untrusted keysUrl: ${value}. Must be a *.jaw.id domain (HTTPS) or localhost.`,
    );
  }
  const config = loadConfig();
  const updated = { ...config, [key]: value };
  saveConfig(updated);
}
