import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJawRpc } from "./rpc-client.js";

describe("fetchJawRpc", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should POST JSON-RPC to the JAW proxy with api key", async () => {
    const mockResult = { "0x1": [{ balance: "0x123" }] };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: "1", result: mockResult }),
    } as Response);

    const result = await fetchJawRpc(
      "wallet_getAssets",
      [{ account: "0xabc" }],
      "test-api-key",
    );

    expect(result).toEqual(mockResult);
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toContain("/handle");
    expect(opts?.method).toBe("POST");
    expect((opts?.headers as Record<string, string>)["x-api-key"]).toBe(
      "test-api-key",
    );

    const body = JSON.parse(opts?.body as string);
    expect(body.method).toBe("wallet_getAssets");
    expect(body.params).toEqual([{ account: "0xabc" }]);
    expect(body.jsonrpc).toBe("2.0");
  });

  it("should throw on HTTP error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(fetchJawRpc("wallet_getAssets", [], "key")).rejects.toThrow(
      "JAW API request failed: 500",
    );
  });

  it("should throw on JSON-RPC error", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: "2.0",
        id: "1",
        error: { code: -32600, message: "Invalid request" },
      }),
    } as Response);

    await expect(fetchJawRpc("wallet_getAssets", [], "key")).rejects.toThrow(
      "[-32600] Invalid request",
    );
  });

  it("should return undefined result when result is null", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: "1", result: null }),
    } as Response);

    const result = await fetchJawRpc("wallet_getCallsStatus", ["0xabc"], "key");
    expect(result).toBeNull();
  });
});
