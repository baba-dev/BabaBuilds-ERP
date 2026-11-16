import { describe, expect, it } from "vitest";
import { extractErrorCodeFromUrl, resolveLoginErrorKey } from "@/lib/auth/login-errors";
import en from "@/messages/en-IN.json";

describe("login error mapping", () => {
  it("maps known NextAuth and policy codes", () => {
    expect(resolveLoginErrorKey("Verification")).toBe("linkExpired");
    expect(resolveLoginErrorKey("OAuthAccountNotLinked")).toBe("accountNotLinked");
    expect(resolveLoginErrorKey("HIGH_RISK_PASSWORD_BLOCKED")).toBe("highRiskPassword");
    expect(resolveLoginErrorKey("MFA_POLICY_BLOCK")).toBe("mfaPolicy");
    expect(resolveLoginErrorKey("WORKSPACE_CONTEXT_MISSING")).toBe("workspaceMissing");
  });

  it("falls back to a generic message for unknown codes and none for no error", () => {
    expect(resolveLoginErrorKey("SomethingNew")).toBe("generic");
    expect(resolveLoginErrorKey(undefined)).toBeNull();
    expect(resolveLoginErrorKey("")).toBeNull();
  });

  it("every mapped key has an English message", () => {
    const codes = [
      "HIGH_RISK_MAGIC_LINK_BLOCKED", "HIGH_RISK_PASSWORD_BLOCKED", "MFA_POLICY_BLOCK", "Verification",
      "OAuthAccountNotLinked", "CredentialsSignin", "AccessDenied", "Configuration", "OAuthSignin",
      "SessionRequired", "WORKSPACE_CONTEXT_MISSING", "unknown",
    ];
    const messages = (en as { LoginPage: { errors: Record<string, string> } }).LoginPage.errors;
    for (const code of codes) {
      const key = resolveLoginErrorKey(code)!;
      expect(messages[key], `${code} -> ${key}`).toBeTruthy();
    }
    expect(messages.linkFailed).toBeTruthy();
  });

  it("extracts the error code from redirect URLs", () => {
    expect(extractErrorCodeFromUrl("https://erp.example.com/login?error=MFA_POLICY_BLOCK&provider=x")).toBe("MFA_POLICY_BLOCK");
    expect(extractErrorCodeFromUrl("/login?error=Verification")).toBe("Verification");
    expect(extractErrorCodeFromUrl("/dashboard")).toBeNull();
    expect(extractErrorCodeFromUrl(null)).toBeNull();
  });
});
