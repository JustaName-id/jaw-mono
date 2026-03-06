import { describe, it, expect } from "vitest";
import {
  isValidAddress,
  isValidHex,
  isValidChainId,
  parseChainId,
  assertAddress,
  isValidKeysUrl,
} from "./validation.js";

describe("validation", () => {
  describe("isValidAddress", () => {
    it("accepts valid address", () => {
      expect(isValidAddress("0x1234567890123456789012345678901234567890")).toBe(
        true,
      );
    });
    it("rejects short address", () => {
      expect(isValidAddress("0x1234")).toBe(false);
    });
    it("rejects no prefix", () => {
      expect(isValidAddress("1234567890123456789012345678901234567890")).toBe(
        false,
      );
    });
  });

  describe("isValidHex", () => {
    it("accepts valid hex", () => {
      expect(isValidHex("0xabcdef")).toBe(true);
    });
    it("accepts empty hex", () => {
      expect(isValidHex("0x")).toBe(true);
    });
    it("rejects invalid characters", () => {
      expect(isValidHex("0xGG")).toBe(false);
    });
  });

  describe("isValidChainId", () => {
    it("accepts positive integer", () => {
      expect(isValidChainId(1)).toBe(true);
      expect(isValidChainId(8453)).toBe(true);
    });
    it("rejects zero", () => {
      expect(isValidChainId(0)).toBe(false);
    });
    it("rejects negative", () => {
      expect(isValidChainId(-1)).toBe(false);
    });
  });

  describe("parseChainId", () => {
    it("parses valid chain ID", () => {
      expect(parseChainId("8453")).toBe(8453);
    });
    it("throws on invalid chain ID", () => {
      expect(() => parseChainId("abc")).toThrow("Invalid chain ID");
    });
  });

  describe("assertAddress", () => {
    it("returns valid address", () => {
      const addr = assertAddress("0x1234567890123456789012345678901234567890");
      expect(addr).toBe("0x1234567890123456789012345678901234567890");
    });
    it("throws on invalid address", () => {
      expect(() => assertAddress("not-an-address")).toThrow("Invalid address");
    });
  });

  describe("isValidKeysUrl", () => {
    it("accepts https *.jaw.id", () => {
      expect(isValidKeysUrl("https://keys.jaw.id")).toBe(true);
      expect(isValidKeysUrl("https://staging.keys.jaw.id")).toBe(true);
    });
    it("accepts https jaw.id", () => {
      expect(isValidKeysUrl("https://jaw.id")).toBe(true);
    });
    it("accepts localhost (http)", () => {
      expect(isValidKeysUrl("http://localhost:3000")).toBe(true);
    });
    it("accepts 127.0.0.1 (http)", () => {
      expect(isValidKeysUrl("http://127.0.0.1:3000")).toBe(true);
    });
    it("rejects untrusted domain", () => {
      expect(isValidKeysUrl("https://evil.com")).toBe(false);
    });
    it("rejects http for non-localhost", () => {
      expect(isValidKeysUrl("http://keys.jaw.id")).toBe(false);
    });
    it("rejects invalid URL", () => {
      expect(isValidKeysUrl("not-a-url")).toBe(false);
    });
  });
});
