import { describe, it, expect } from "vitest";
import {
  classifyMethod,
  needsBrowser,
  SUPPORTED_METHODS,
} from "./rpc-classifier.js";

describe("rpc-classifier", () => {
  it("classifies read-only methods", () => {
    expect(classifyMethod("eth_accounts")).toBe("read-only");
    expect(classifyMethod("eth_chainId")).toBe("read-only");
    expect(classifyMethod("wallet_getAssets")).toBe("read-only");
    expect(classifyMethod("wallet_getCallsStatus")).toBe("read-only");
    expect(classifyMethod("wallet_getPermissions")).toBe("read-only");
  });

  it("classifies signing-required methods", () => {
    expect(classifyMethod("wallet_sendCalls")).toBe("signing-required");
    expect(classifyMethod("personal_sign")).toBe("signing-required");
    expect(classifyMethod("eth_signTypedData_v4")).toBe("signing-required");
    expect(classifyMethod("wallet_grantPermissions")).toBe("signing-required");
    expect(classifyMethod("wallet_revokePermissions")).toBe("signing-required");
  });

  it("classifies session-management methods", () => {
    expect(classifyMethod("eth_requestAccounts")).toBe("session-management");
    expect(classifyMethod("wallet_connect")).toBe("session-management");
  });

  it("classifies wallet_switchEthereumChain and wallet_disconnect as local-only", () => {
    expect(classifyMethod("wallet_switchEthereumChain")).toBe("local-only");
    expect(classifyMethod("wallet_disconnect")).toBe("local-only");
    expect(needsBrowser("wallet_disconnect")).toBe(false);
  });

  it("defaults unknown methods to signing-required", () => {
    expect(classifyMethod("some_unknown_method")).toBe("signing-required");
  });

  it("needsBrowser returns true for signing and session methods", () => {
    expect(needsBrowser("wallet_sendCalls")).toBe(true);
    expect(needsBrowser("eth_requestAccounts")).toBe(true);
    expect(needsBrowser("personal_sign")).toBe(true);
  });

  it("needsBrowser returns false for read-only methods", () => {
    expect(needsBrowser("eth_accounts")).toBe(false);
    expect(needsBrowser("eth_chainId")).toBe(false);
    expect(needsBrowser("wallet_getAssets")).toBe(false);
  });

  it("SUPPORTED_METHODS includes all classified methods", () => {
    expect(SUPPORTED_METHODS).toContain("wallet_sendCalls");
    expect(SUPPORTED_METHODS).toContain("eth_accounts");
    expect(SUPPORTED_METHODS).toContain("wallet_connect");
    expect(SUPPORTED_METHODS.length).toBeGreaterThan(15);
  });
});
