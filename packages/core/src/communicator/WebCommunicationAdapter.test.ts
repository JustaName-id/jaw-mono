import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebCommunicationAdapter } from "./WebCommunicationAdapter.js";
import { Communicator } from "./communicator.js";
import type { Message, MessageID } from "../messages/message.js";

// Mock the Communicator class
vi.mock("./communicator.js", () => ({
  Communicator: vi.fn(() => ({
    waitForPopupLoaded: vi.fn(),
    postRequestAndWaitForResponse: vi.fn(),
    postMessage: vi.fn(),
    onMessage: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

describe("WebCommunicationAdapter", () => {
  let adapter: WebCommunicationAdapter;
  let mockCommunicator: {
    waitForPopupLoaded: ReturnType<typeof vi.fn>;
    postRequestAndWaitForResponse: ReturnType<typeof vi.fn>;
    postMessage: ReturnType<typeof vi.fn>;
    onMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  const mockOptions = {
    metadata: {
      appName: "Test App",
      appLogoUrl: null,
      defaultChainId: 1,
    },
    preference: {
      keysUrl: "https://keys.jaw.id",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    adapter = new WebCommunicationAdapter(mockOptions);

    // Get the mock instance created by the constructor
    mockCommunicator = (Communicator as ReturnType<typeof vi.fn>).mock
      .results[0].value;
  });

  describe("constructor", () => {
    it("should create a Communicator with the provided options", () => {
      expect(Communicator).toHaveBeenCalledWith(mockOptions);
      expect(Communicator).toHaveBeenCalledTimes(1);
    });

    it("should pass through custom keysUrl in options", () => {
      const customOptions = {
        metadata: {
          appName: "Custom App",
          appLogoUrl: "https://example.com/logo.png",
          defaultChainId: 137,
        },
        preference: {
          keysUrl: "https://custom-keys.example.com",
        },
      };

      new WebCommunicationAdapter(customOptions);

      expect(Communicator).toHaveBeenLastCalledWith(customOptions);
    });
  });

  describe("waitForReady", () => {
    it("should delegate to communicator.waitForPopupLoaded", async () => {
      mockCommunicator.waitForPopupLoaded.mockResolvedValue({} as Window);

      await adapter.waitForReady();

      expect(mockCommunicator.waitForPopupLoaded).toHaveBeenCalledTimes(1);
    });

    it("should propagate errors from communicator.waitForPopupLoaded", async () => {
      const error = new Error("Popup blocked");
      mockCommunicator.waitForPopupLoaded.mockRejectedValue(error);

      await expect(adapter.waitForReady()).rejects.toThrow("Popup blocked");
    });
  });

  describe("postRequestAndWaitForResponse", () => {
    it("should delegate to communicator with the request and return response", async () => {
      const request: Message & { id: MessageID } = {
        id: "12345678-1234-1234-1234-123456789012" as MessageID,
        data: { method: "wallet_connect" },
      };
      const expectedResponse: Message = {
        requestId: request.id,
        data: { result: "connected" },
      };
      mockCommunicator.postRequestAndWaitForResponse.mockResolvedValue(
        expectedResponse,
      );

      const response = await adapter.postRequestAndWaitForResponse(request);

      expect(
        mockCommunicator.postRequestAndWaitForResponse,
      ).toHaveBeenCalledWith(request);
      expect(response).toEqual(expectedResponse);
    });

    it("should propagate errors from communicator", async () => {
      const request: Message & { id: MessageID } = {
        id: "12345678-1234-1234-1234-123456789012" as MessageID,
        data: {},
      };
      const error = new Error("Request rejected");
      mockCommunicator.postRequestAndWaitForResponse.mockRejectedValue(error);

      await expect(
        adapter.postRequestAndWaitForResponse(request),
      ).rejects.toThrow("Request rejected");
    });
  });

  describe("postMessage", () => {
    it("should delegate to communicator.postMessage", async () => {
      const message: Message = {
        requestId: "12345678-1234-1234-1234-123456789012" as MessageID,
        data: { event: "update" },
      };
      mockCommunicator.postMessage.mockResolvedValue(undefined);

      await adapter.postMessage(message);

      expect(mockCommunicator.postMessage).toHaveBeenCalledWith(message);
    });

    it("should propagate errors from communicator.postMessage", async () => {
      const message: Message = { data: "test" };
      const error = new Error("Popup closed");
      mockCommunicator.postMessage.mockRejectedValue(error);

      await expect(adapter.postMessage(message)).rejects.toThrow(
        "Popup closed",
      );
    });
  });

  describe("onMessage", () => {
    it("should delegate to communicator.onMessage with predicate", async () => {
      const expectedMessage: Message = {
        id: "12345678-1234-1234-1234-123456789012" as MessageID,
        data: { event: "PopupReady" },
      };
      const predicate = (msg: Partial<Message>) => msg.data === "PopupReady";

      mockCommunicator.onMessage.mockResolvedValue(expectedMessage);

      const result = await adapter.onMessage(predicate);

      expect(mockCommunicator.onMessage).toHaveBeenCalledWith(predicate);
      expect(result).toEqual(expectedMessage);
    });

    it("should propagate errors from communicator.onMessage", async () => {
      const predicate = () => true;
      const error = new Error("Disconnected");
      mockCommunicator.onMessage.mockRejectedValue(error);

      await expect(adapter.onMessage(predicate)).rejects.toThrow(
        "Disconnected",
      );
    });
  });

  describe("disconnect", () => {
    it("should delegate to communicator.disconnect", () => {
      adapter.disconnect();

      expect(mockCommunicator.disconnect).toHaveBeenCalledTimes(1);
    });

    it("should be callable multiple times without error", () => {
      adapter.disconnect();
      adapter.disconnect();

      expect(mockCommunicator.disconnect).toHaveBeenCalledTimes(2);
    });
  });

  describe("CommunicationAdapter interface compliance", () => {
    it("should not have an init method (web adapter does not need initialization)", () => {
      // WebCommunicationAdapter does not implement init() because
      // the web popup flow doesn't need pre-initialization config.
      // The CommunicationAdapter interface marks init as optional.
      expect(
        (adapter as unknown as Record<string, unknown>).init,
      ).toBeUndefined();
    });

    it("should implement all required CommunicationAdapter methods", () => {
      expect(typeof adapter.waitForReady).toBe("function");
      expect(typeof adapter.postRequestAndWaitForResponse).toBe("function");
      expect(typeof adapter.postMessage).toBe("function");
      expect(typeof adapter.onMessage).toBe("function");
      expect(typeof adapter.disconnect).toBe("function");
    });
  });
});
