import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSigner } from "./utils.js";
import type { CommunicationAdapter } from "../communicator/index.js";
import type { AppMetadata, ProviderEventCallback } from "../provider/interface.js";
import type { UIHandler } from "../ui/interface.js";

// Mock signer implementations to isolate factory logic
vi.mock("./cross-platform/CrossPlatformSigner.js", () => ({
  CrossPlatformSigner: vi.fn(() => ({
    type: "crossPlatform",
    handshake: vi.fn(),
    request: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

vi.mock("./app-specific/AppSpecificSigner.js", () => ({
  AppSpecificSigner: vi.fn(() => ({
    type: "appSpecific",
    handshake: vi.fn(),
    request: vi.fn(),
    cleanup: vi.fn(),
  })),
}));

describe("createSigner", () => {
  let mockMetadata: AppMetadata;
  let mockCallback: ProviderEventCallback;
  let mockAdapter: CommunicationAdapter;
  let mockUIHandler: UIHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetadata = {
      appName: "Test App",
      appLogoUrl: null,
      defaultChainId: 1,
    };

    mockCallback = vi.fn() as unknown as ProviderEventCallback;

    mockAdapter = {
      init: vi.fn(),
      waitForReady: vi.fn(),
      postRequestAndWaitForResponse: vi.fn(),
      postMessage: vi.fn(),
      onMessage: vi.fn(),
      disconnect: vi.fn(),
    };

    mockUIHandler = {} as UIHandler;
  });

  describe("crossPlatform signer", () => {
    it("should create a CrossPlatformSigner when adapter is provided", () => {
      const signer = createSigner({
        signerType: "crossPlatform",
        metadata: mockMetadata,
        adapter: mockAdapter,
        callback: mockCallback,
        apiKey: "test-api-key",
      });

      expect(signer).toBeDefined();
    });

    it("should throw when adapter is missing for crossPlatform", () => {
      expect(() =>
        createSigner({
          signerType: "crossPlatform",
          metadata: mockMetadata,
          callback: mockCallback,
          apiKey: "test-api-key",
          // adapter intentionally omitted
        }),
      ).toThrow("CommunicationAdapter is required for crossPlatform signer");
    });

    it("should pass keysUrl and showTestnets to CrossPlatformSigner", async () => {
      const { CrossPlatformSigner } = await import(
        "./cross-platform/CrossPlatformSigner.js"
      );

      createSigner({
        signerType: "crossPlatform",
        metadata: mockMetadata,
        adapter: mockAdapter,
        callback: mockCallback,
        apiKey: "test-api-key",
        keysUrl: "https://custom-keys.example.com",
        showTestnets: true,
      });

      expect(CrossPlatformSigner).toHaveBeenCalledWith({
        metadata: mockMetadata,
        callback: mockCallback,
        adapter: mockAdapter,
        apiKey: "test-api-key",
        keysUrl: "https://custom-keys.example.com",
        showTestnets: true,
      });
    });
  });

  describe("appSpecific signer", () => {
    it("should create an AppSpecificSigner when uiHandler is provided", () => {
      const signer = createSigner({
        signerType: "appSpecific",
        metadata: mockMetadata,
        uiHandler: mockUIHandler,
        callback: mockCallback,
        apiKey: "test-api-key",
      });

      expect(signer).toBeDefined();
    });

    it("should throw when uiHandler is missing for appSpecific", () => {
      expect(() =>
        createSigner({
          signerType: "appSpecific",
          metadata: mockMetadata,
          callback: mockCallback,
          apiKey: "test-api-key",
          // uiHandler intentionally omitted
        }),
      ).toThrow("UIHandler is required for appSpecific signer");
    });

    it("should pass paymasters and ens to AppSpecificSigner", async () => {
      const { AppSpecificSigner } = await import(
        "./app-specific/AppSpecificSigner.js"
      );

      const paymasters = { 1: { url: "https://paymaster.example.com" } };

      createSigner({
        signerType: "appSpecific",
        metadata: mockMetadata,
        uiHandler: mockUIHandler,
        callback: mockCallback,
        apiKey: "test-api-key",
        paymasters,
        ens: "test.jaw.id",
      });

      expect(AppSpecificSigner).toHaveBeenCalledWith({
        metadata: mockMetadata,
        callback: mockCallback,
        uiHandler: mockUIHandler,
        apiKey: "test-api-key",
        paymasters,
        ens: "test.jaw.id",
      });
    });

    it("should not require adapter for appSpecific signer", () => {
      expect(() =>
        createSigner({
          signerType: "appSpecific",
          metadata: mockMetadata,
          uiHandler: mockUIHandler,
          callback: mockCallback,
          apiKey: "test-api-key",
          // adapter not needed
        }),
      ).not.toThrow();
    });
  });
});
