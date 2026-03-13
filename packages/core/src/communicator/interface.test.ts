import { describe, it, expect, vi } from "vitest";
import type {
  CommunicationAdapter,
  CommunicationAdapterConfig,
} from "./interface.js";
import type { Message, MessageID } from "../messages/message.js";

/**
 * Tests for CommunicationAdapter interface contract.
 * Validates that a mock adapter implementation satisfies all interface requirements
 * and that the SDK properly handles different adapter behaviors (mobile, web, etc.).
 */
describe("CommunicationAdapter interface contract", () => {
  function createMockAdapter(
    overrides: Partial<CommunicationAdapter> = {},
  ): CommunicationAdapter {
    return {
      waitForReady: vi.fn().mockResolvedValue(undefined),
      postRequestAndWaitForResponse: vi.fn().mockResolvedValue({
        requestId: "mock-id",
        data: {},
      }),
      postMessage: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn().mockResolvedValue({ data: {} }),
      disconnect: vi.fn(),
      ...overrides,
    };
  }

  describe("init (optional)", () => {
    it("should work with an adapter that implements init", () => {
      const initFn = vi.fn();
      const adapter = createMockAdapter({ init: initFn });

      const config: CommunicationAdapterConfig = {
        apiKey: "test-key",
        appName: "Test App",
        appLogoUrl: "https://example.com/logo.png",
        defaultChainId: 1,
        keysUrl: "https://keys.jaw.id",
        showTestnets: false,
      };

      adapter.init?.(config);

      expect(initFn).toHaveBeenCalledWith(config);
    });

    it("should work with an adapter that does not implement init", () => {
      const adapter = createMockAdapter();
      // init is not set, so optional chaining should be safe
      expect(() => adapter.init?.({
        apiKey: "key",
        appName: "App",
      })).not.toThrow();
    });

    it("should pass all config fields to init", () => {
      const initFn = vi.fn();
      const adapter = createMockAdapter({ init: initFn });

      const config: CommunicationAdapterConfig = {
        apiKey: "api-key-123",
        appName: "My DApp",
        appLogoUrl: "https://example.com/icon.png",
        defaultChainId: 137,
        keysUrl: "https://custom.keys.io",
        showTestnets: true,
      };

      adapter.init?.(config);

      expect(initFn).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "api-key-123",
          appName: "My DApp",
          appLogoUrl: "https://example.com/icon.png",
          defaultChainId: 137,
          keysUrl: "https://custom.keys.io",
          showTestnets: true,
        }),
      );
    });

    it("should handle config with only required fields", () => {
      const initFn = vi.fn();
      const adapter = createMockAdapter({ init: initFn });

      const minimalConfig: CommunicationAdapterConfig = {
        apiKey: "key",
        appName: "App",
      };

      adapter.init?.(minimalConfig);

      expect(initFn).toHaveBeenCalledWith(minimalConfig);
    });
  });

  describe("waitForReady", () => {
    it("should return a promise that resolves", async () => {
      const adapter = createMockAdapter();
      await expect(adapter.waitForReady()).resolves.toBeUndefined();
    });

    it("should be callable multiple times (idempotent for reuse)", async () => {
      const adapter = createMockAdapter();
      await adapter.waitForReady();
      await adapter.waitForReady();
      expect(adapter.waitForReady).toHaveBeenCalledTimes(2);
    });
  });

  describe("postRequestAndWaitForResponse", () => {
    it("should accept a request with id and return a response", async () => {
      const mockResponse: Message = {
        requestId: "req-123" as MessageID,
        data: { result: "success" },
      };

      const adapter = createMockAdapter({
        postRequestAndWaitForResponse: vi.fn().mockResolvedValue(mockResponse),
      });

      const request: Message & { id: MessageID } = {
        id: "req-123" as MessageID,
        data: { method: "wallet_connect" },
      };

      const response = await adapter.postRequestAndWaitForResponse(request);

      expect(response).toEqual(mockResponse);
    });
  });

  describe("postMessage", () => {
    it("should accept any Message and return void", async () => {
      const adapter = createMockAdapter();
      const message: Message = { data: { event: "config" } };

      await expect(adapter.postMessage(message)).resolves.toBeUndefined();
    });
  });

  describe("onMessage", () => {
    it("should accept a predicate and return matching message", async () => {
      const expectedMessage: Message = {
        id: "msg-456" as MessageID,
        data: { event: "PopupReady" },
      };

      const adapter = createMockAdapter({
        onMessage: vi.fn().mockResolvedValue(expectedMessage),
      });

      const predicate = (msg: Partial<Message>) =>
        (msg.data as Record<string, unknown>)?.event === "PopupReady";

      const result = await adapter.onMessage(predicate);
      expect(result).toEqual(expectedMessage);
    });
  });

  describe("disconnect", () => {
    it("should be synchronous and return void", () => {
      const adapter = createMockAdapter();
      expect(() => adapter.disconnect()).not.toThrow();
    });

    it("should be safe to call after already disconnected", () => {
      const adapter = createMockAdapter();
      adapter.disconnect();
      adapter.disconnect();
      expect(adapter.disconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe("full lifecycle", () => {
    it("should support init → waitForReady → postRequest → disconnect", async () => {
      const initFn = vi.fn();
      const adapter = createMockAdapter({ init: initFn });

      // 1. Init (optional)
      adapter.init?.({ apiKey: "key", appName: "App" });
      expect(initFn).toHaveBeenCalled();

      // 2. Wait for ready
      await adapter.waitForReady();
      expect(adapter.waitForReady).toHaveBeenCalled();

      // 3. Send request
      const request: Message & { id: MessageID } = {
        id: "req-789" as MessageID,
        data: {},
      };
      await adapter.postRequestAndWaitForResponse(request);
      expect(adapter.postRequestAndWaitForResponse).toHaveBeenCalledWith(
        request,
      );

      // 4. Disconnect
      adapter.disconnect();
      expect(adapter.disconnect).toHaveBeenCalled();
    });
  });
});
