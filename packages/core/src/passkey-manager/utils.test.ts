import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPasskeyUtils,
  authenticateWithWebAuthnUtils,
  importPasskeyUtils,
  WebAuthnAuthenticationError,
  PasskeyRegistrationError,
  PasskeyLookupError,
} from "./utils.js";

// Mock viem/account-abstraction
vi.mock("viem/account-abstraction", () => ({
  createWebAuthnCredential: vi.fn().mockResolvedValue({
    id: "cred-standard-123",
    publicKey: "0x04standard",
  }),
  toWebAuthnAccount: vi.fn().mockReturnValue({
    type: "webAuthn",
    publicKey: "0x04abc",
  }),
}));

// Mock the API module
vi.mock("../api/index.js", () => ({
  restCall: vi.fn().mockResolvedValue({
    passkeys: [
      {
        credentialId: "cred-imported",
        publicKey: "0x04imported",
        displayName: "imported-user",
      },
    ],
  }),
}));

describe("passkey-manager/utils — React Native adapter support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createPasskeyUtils", () => {
    it("should use nativeCreateFn path when provided (bypasses crypto.subtle)", async () => {
      const { toWebAuthnAccount } = await import("viem/account-abstraction");
      const { restCall } = await import("../api/index.js");

      const mockNativeCreateFn = vi.fn().mockResolvedValue({
        id: "native-cred-id",
        publicKey: "0x04nativepub" as `0x${string}`,
      });
      const mockGetFn = vi.fn();

      const result = await createPasskeyUtils(
        "alice",
        "example.com",
        "MyApp",
        undefined,
        mockNativeCreateFn,
        mockGetFn,
      );

      expect(mockNativeCreateFn).toHaveBeenCalledWith(
        "alice",
        "example.com",
        "MyApp",
      );
      expect(result.credentialId).toBe("native-cred-id");
      expect(result.publicKey).toBe("0x04nativepub");
      expect(toWebAuthnAccount).toHaveBeenCalledWith({
        credential: { id: "native-cred-id", publicKey: "0x04nativepub" },
        getFn: mockGetFn,
        rpId: "example.com",
      });
      // Should register with backend
      expect(restCall).toHaveBeenCalledWith(
        "REGISTER_PASSKEY",
        "POST",
        {
          credentialId: "native-cred-id",
          publicKey: "0x04nativepub",
          displayName: "alice",
        },
        {},
        undefined,
        undefined,
        undefined,
      );
    });

    it("should use createFn path when provided (custom WebAuthn create)", async () => {
      const { createWebAuthnCredential, toWebAuthnAccount } =
        await import("viem/account-abstraction");

      await createPasskeyUtils(
        "bob",
        "example.com",
        "MyApp",
        vi.fn(), // custom createFn
        undefined,
        vi.fn(), // custom getFn
      );

      // Should pass createFn to createWebAuthnCredential
      expect(createWebAuthnCredential).toHaveBeenCalledWith(
        expect.objectContaining({
          createFn: expect.any(Function),
        }),
      );
      // Should pass getFn and rpId to toWebAuthnAccount
      expect(toWebAuthnAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          getFn: expect.any(Function),
          rpId: "example.com",
        }),
      );
    });

    it("should throw PasskeyRegistrationError when no WebAuthn support and no createFn", async () => {
      // In test env, window.PublicKeyCredential is not available
      await expect(
        createPasskeyUtils("charlie", "example.com", "MyApp"),
      ).rejects.toThrow(PasskeyRegistrationError);
    });

    it("should not throw for missing WebAuthn when createFn is provided", async () => {
      const mockCreateFn = vi.fn();
      // Should not throw even without window.PublicKeyCredential
      await expect(
        createPasskeyUtils("charlie", "example.com", "MyApp", mockCreateFn),
      ).resolves.toBeDefined();
    });
  });

  describe("authenticateWithWebAuthnUtils", () => {
    it("should use custom getFn when provided instead of navigator.credentials.get", async () => {
      const mockCredential = {
        id: "cred-123",
        type: "public-key",
        rawId: new ArrayBuffer(32),
        response: {},
        getClientExtensionResults: () => ({}),
        authenticatorAttachment: null,
      };
      const mockGetFn = vi.fn().mockResolvedValue(mockCredential);

      const result = await authenticateWithWebAuthnUtils(
        "example.com",
        "dGVzdA", // base64url for "test"
        undefined,
        mockGetFn,
      );

      expect(mockGetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            rpId: "example.com",
            allowCredentials: expect.arrayContaining([
              expect.objectContaining({ type: "public-key" }),
            ]),
          }),
        }),
      );
      expect(result.credential).toBe(mockCredential);
      expect(result.challenge).toBeInstanceOf(Uint8Array);
    });

    it("should skip WebAuthn environment check when getFn is provided", async () => {
      // In test env, window.PublicKeyCredential is not available
      // With getFn, it should NOT throw the environment error
      const mockGetFn = vi.fn().mockResolvedValue({
        id: "cred-123",
        type: "public-key",
        rawId: new ArrayBuffer(0),
        response: {},
        getClientExtensionResults: () => ({}),
        authenticatorAttachment: null,
      });

      await expect(
        authenticateWithWebAuthnUtils(
          "example.com",
          "dGVzdA",
          undefined,
          mockGetFn,
        ),
      ).resolves.toBeDefined();
    });

    it("should throw WebAuthnAuthenticationError without getFn in non-browser env", async () => {
      await expect(
        authenticateWithWebAuthnUtils("example.com", "dGVzdA"),
      ).rejects.toThrow(WebAuthnAuthenticationError);
      await expect(
        authenticateWithWebAuthnUtils("example.com", "dGVzdA"),
      ).rejects.toThrow("WebAuthn is not supported in this environment");
    });

    it("should throw when getFn returns null", async () => {
      const mockGetFn = vi.fn().mockResolvedValue(null);

      await expect(
        authenticateWithWebAuthnUtils(
          "example.com",
          "dGVzdA",
          undefined,
          mockGetFn,
        ),
      ).rejects.toThrow("Failed to authenticate with specified passkey");
    });

    it("should wrap getFn errors in WebAuthnAuthenticationError", async () => {
      const mockGetFn = vi
        .fn()
        .mockRejectedValue(new Error("RN passkey error"));

      await expect(
        authenticateWithWebAuthnUtils(
          "example.com",
          "dGVzdA",
          undefined,
          mockGetFn,
        ),
      ).rejects.toThrow(WebAuthnAuthenticationError);
      await expect(
        authenticateWithWebAuthnUtils(
          "example.com",
          "dGVzdA",
          undefined,
          mockGetFn,
        ),
      ).rejects.toThrow("RN passkey error");
    });

    it("should pass custom options (userVerification, timeout, transports)", async () => {
      const mockGetFn = vi.fn().mockResolvedValue({
        id: "cred-123",
        type: "public-key",
        rawId: new ArrayBuffer(0),
        response: {},
        getClientExtensionResults: () => ({}),
        authenticatorAttachment: null,
      });

      await authenticateWithWebAuthnUtils(
        "example.com",
        "dGVzdA",
        {
          userVerification: "required",
          timeout: 30000,
          transports: ["ble"],
        },
        mockGetFn,
      );

      const callArgs = mockGetFn.mock.calls[0][0];
      expect(callArgs.publicKey.userVerification).toBe("required");
      expect(callArgs.publicKey.timeout).toBe(30000);
      expect(callArgs.publicKey.allowCredentials[0].transports).toEqual([
        "ble",
      ]);
    });
  });

  describe("importPasskeyUtils", () => {
    it("should use custom getFn when provided", async () => {
      const mockCredential = {
        id: "imported-cred-id",
        type: "public-key",
        rawId: new ArrayBuffer(0),
        response: {},
        getClientExtensionResults: () => ({}),
        authenticatorAttachment: null,
      };
      const mockGetFn = vi.fn().mockResolvedValue(mockCredential);

      const result = await importPasskeyUtils(mockGetFn, "example.com");

      expect(mockGetFn).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            userVerification: "preferred",
            timeout: 60000,
            rpId: "example.com",
          }),
        }),
      );
      expect(result.credential.id).toBe("imported-cred-id");
    });

    it("should include rpId in publicKeyOptions when provided", async () => {
      const mockGetFn = vi.fn().mockResolvedValue({
        id: "cred-id",
        type: "public-key",
        rawId: new ArrayBuffer(0),
        response: {},
        getClientExtensionResults: () => ({}),
        authenticatorAttachment: null,
      });

      await importPasskeyUtils(mockGetFn, "myapp.com");

      const callArgs = mockGetFn.mock.calls[0][0];
      expect(callArgs.publicKey.rpId).toBe("myapp.com");
    });

    it("should throw when getFn returns null", async () => {
      const mockGetFn = vi.fn().mockResolvedValue(null);

      await expect(
        importPasskeyUtils(mockGetFn, "example.com"),
      ).rejects.toThrow(PasskeyLookupError);
    });

    it("should throw when getFn rejects", async () => {
      const mockGetFn = vi.fn().mockRejectedValue(new Error("RN error"));

      await expect(
        importPasskeyUtils(mockGetFn, "example.com"),
      ).rejects.toThrow(PasskeyLookupError);
    });

    it("should throw when rpId is missing in non-browser environment", async () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - simulating non-browser environment
      delete globalThis.window;

      try {
        const mockGetFn = vi.fn();
        await expect(importPasskeyUtils(mockGetFn)).rejects.toThrow(
          "rpId is required in non-browser environments",
        );
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });

  describe("error classes", () => {
    it("WebAuthnAuthenticationError should have correct name and cause", () => {
      const cause = new Error("root cause");
      const error = new WebAuthnAuthenticationError("auth failed", cause);
      expect(error.name).toBe("WebAuthnAuthenticationError");
      expect(error.message).toBe("auth failed");
      expect(error.cause).toBe(cause);
    });

    it("PasskeyRegistrationError should have correct name", () => {
      const error = new PasskeyRegistrationError("reg failed");
      expect(error.name).toBe("PasskeyRegistrationError");
    });

    it("PasskeyLookupError should have correct name", () => {
      const error = new PasskeyLookupError("lookup failed");
      expect(error.name).toBe("PasskeyLookupError");
    });
  });
});
