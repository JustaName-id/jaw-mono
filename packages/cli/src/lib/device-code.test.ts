import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("isHeadlessEnvironment", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
  });

  it("returns true when SSH_CLIENT is set", async () => {
    process.env["SSH_CLIENT"] = "192.168.1.1 12345 22";
    const { isHeadlessEnvironment } = await import("./device-code.js");
    expect(isHeadlessEnvironment()).toBe(true);
  });

  it("returns true when SSH_TTY is set", async () => {
    process.env["SSH_TTY"] = "/dev/pts/0";
    const { isHeadlessEnvironment } = await import("./device-code.js");
    expect(isHeadlessEnvironment()).toBe(true);
  });

  it("returns true when CI is set", async () => {
    process.env["CI"] = "true";
    const { isHeadlessEnvironment } = await import("./device-code.js");
    expect(isHeadlessEnvironment()).toBe(true);
  });

  it("returns true when GITHUB_ACTIONS is set", async () => {
    process.env["GITHUB_ACTIONS"] = "true";
    const { isHeadlessEnvironment } = await import("./device-code.js");
    expect(isHeadlessEnvironment()).toBe(true);
  });

  it("returns true when container env is set", async () => {
    process.env["DOCKER_CONTAINER"] = "true";
    const { isHeadlessEnvironment } = await import("./device-code.js");
    expect(isHeadlessEnvironment()).toBe(true);
  });

  it("returns false in normal desktop environment", async () => {
    // Clear all headless indicators
    delete process.env["SSH_CLIENT"];
    delete process.env["SSH_TTY"];
    delete process.env["CI"];
    delete process.env["GITHUB_ACTIONS"];
    delete process.env["container"];
    delete process.env["DOCKER_CONTAINER"];
    // On macOS, DISPLAY isn't needed — only matters on Linux
    const { isHeadlessEnvironment } = await import("./device-code.js");
    if (process.platform !== "linux") {
      expect(isHeadlessEnvironment()).toBe(false);
    }
  });
});

describe("deviceCodeFlow", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates device code and polls until completed", async () => {
    const { deviceCodeFlow } = await import("./device-code.js");

    // Mock POST /api/cli/device
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userCode: "ABCD-1234",
        deviceCode: "dev-123",
        verificationUrl: "https://keys.jaw.id/cli-device",
        expiresIn: 300,
        interval: 3,
      }),
    });

    // Mock GET /api/cli/poll — first pending, then completed
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 202,
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "completed",
        result: ["0x1234567890abcdef1234567890abcdef12345678"],
      }),
    });

    const onDisplayCode = vi.fn();

    const result = await deviceCodeFlow({
      keysUrl: "https://keys.jaw.id",
      method: "wallet_connect",
      timeout: 10000,
      onDisplayCode,
    });

    expect(onDisplayCode).toHaveBeenCalledWith(
      "ABCD-1234",
      "https://keys.jaw.id/cli-device",
    );
    expect(result).toEqual(["0x1234567890abcdef1234567890abcdef12345678"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15000);

  it("throws when device code creation fails", async () => {
    const { deviceCodeFlow } = await import("./device-code.js");

    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Internal Server Error",
    });

    await expect(
      deviceCodeFlow({
        keysUrl: "https://keys.jaw.id",
        method: "wallet_connect",
        timeout: 5000,
      }),
    ).rejects.toThrow("Failed to create device code");
  });

  it("throws when device code expires (404)", async () => {
    const { deviceCodeFlow } = await import("./device-code.js");

    // Create succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userCode: "ABCD-1234",
        deviceCode: "dev-123",
        verificationUrl: "https://keys.jaw.id/cli-device",
        expiresIn: 300,
        interval: 3,
      }),
    });

    // Poll returns 404 (expired)
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await expect(
      deviceCodeFlow({
        keysUrl: "https://keys.jaw.id",
        method: "wallet_connect",
        timeout: 5000,
      }),
    ).rejects.toThrow("Device code expired");
  }, 15000);

  it("throws on poll error status", async () => {
    const { deviceCodeFlow } = await import("./device-code.js");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        userCode: "ABCD-1234",
        deviceCode: "dev-123",
        verificationUrl: "https://keys.jaw.id/cli-device",
        expiresIn: 300,
        interval: 3,
      }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "error",
        error: { code: 4001, message: "User denied" },
      }),
    });

    await expect(
      deviceCodeFlow({
        keysUrl: "https://keys.jaw.id",
        method: "wallet_connect",
        timeout: 5000,
      }),
    ).rejects.toThrow("User denied");
  }, 15000);
});
