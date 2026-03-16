import { describe, it, expect } from "vitest";
import { createLocalStorage } from "./utils.js";

describe("createLocalStorage", () => {
  describe("in-memory fallback (no localStorage)", () => {
    it("should share state across multiple createLocalStorage calls with same scope/name", () => {
      // Simulates RN environment where localStorage is unavailable
      // Two separate calls should share the same globalMemoryStore
      const storageA = createLocalStorage("jaw", "passkeys");
      const storageB = createLocalStorage("jaw", "passkeys");

      storageA.setItem("account-1", { id: "cred-123", publicKey: "0xabc" });

      // storageB should see the same data (singleton memory store)
      const result = storageB.getItem("account-1");
      expect(result).toEqual({ id: "cred-123", publicKey: "0xabc" });
    });

    it("should isolate data between different scope/name prefixes", () => {
      const storageA = createLocalStorage("jaw", "passkeys");
      const storageB = createLocalStorage("jaw", "sessions");

      storageA.setItem("key1", "value-from-passkeys");
      storageB.setItem("key1", "value-from-sessions");

      expect(storageA.getItem("key1")).toBe("value-from-passkeys");
      expect(storageB.getItem("key1")).toBe("value-from-sessions");
    });

    it("should persist data across PasskeyManager-like lifecycle", () => {
      // Simulates: Account.create() stores → Account.get() reads
      const createStorage = createLocalStorage("jaw", "accounts");
      createStorage.setItem("active-credential", "cred-abc");
      createStorage.setItem("account:cred-abc", {
        username: "alice",
        credentialId: "cred-abc",
        publicKey: "0x04def",
      });

      // New storage instance (as if Account.get() created a new PasskeyManager)
      const getStorage = createLocalStorage("jaw", "accounts");
      expect(getStorage.getItem("active-credential")).toBe("cred-abc");
      expect(getStorage.getItem("account:cred-abc")).toEqual({
        username: "alice",
        credentialId: "cred-abc",
        publicKey: "0x04def",
      });
    });

    it("should handle removeItem across instances", () => {
      const storageA = createLocalStorage("jaw", "remove-test");
      const storageB = createLocalStorage("jaw", "remove-test");

      storageA.setItem("to-remove", "data");
      expect(storageB.getItem("to-remove")).toBe("data");

      storageB.removeItem("to-remove");
      expect(storageA.getItem("to-remove")).toBeNull();
    });

    it("should return null for non-existent keys", () => {
      const storage = createLocalStorage("jaw", "empty");
      expect(storage.getItem("nonexistent")).toBeNull();
    });

    it("should handle JSON serialization for objects", () => {
      const storage = createLocalStorage("jaw", "json-test");
      const data = { nested: { value: 42 }, array: [1, 2, 3] };

      storage.setItem("complex", data);
      expect(storage.getItem("complex")).toEqual(data);
    });

    it("should handle string values without double-serialization", () => {
      const storage = createLocalStorage("jaw", "string-test");

      storage.setItem("plain", "hello");
      expect(storage.getItem("plain")).toBe("hello");
    });
  });
});
