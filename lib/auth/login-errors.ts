/**
 * Maps the `?error=` codes NextAuth (and our own sign-in callbacks) put on /login to
 * message keys in the `LoginPage.errors` i18n namespace.
 */
export type LoginErrorKey =
  | "highRiskMagicLink"
  | "highRiskPassword"
  | "mfaPolicy"
  | "linkExpired"
  | "accountNotLinked"
  | "credentials"
  | "accessDenied"
  | "configuration"
  | "oauth"
  | "sessionRequired"
  | "linkFailed"
  | "workspaceMissing"
  | "generic";

const ERROR_CODE_TO_KEY: Record<string, LoginErrorKey> = {
  HIGH_RISK_MAGIC_LINK_BLOCKED: "highRiskMagicLink",
  HIGH_RISK_PASSWORD_BLOCKED: "highRiskPassword",
  MFA_POLICY_BLOCK: "mfaPolicy",
  Verification: "linkExpired",
  OAuthAccountNotLinked: "accountNotLinked",
  CredentialsSignin: "credentials",
  AccessDenied: "accessDenied",
  Configuration: "configuration",
  OAuthSignin: "oauth",
  OAuthCallback: "oauth",
  OAuthCreateAccount: "oauth",
  EmailCreateAccount: "oauth",
  Callback: "oauth",
  SessionRequired: "sessionRequired",
  WORKSPACE_CONTEXT_MISSING: "workspaceMissing",
};

export function resolveLoginErrorKey(code: string | null | undefined): LoginErrorKey | null {
  if (!code) return null;
  return ERROR_CODE_TO_KEY[code] ?? "generic";
}

/** Pulls the `error` query value out of a NextAuth redirect URL, if any. */
export function extractErrorCodeFromUrl(url: string | null | undefined, origin = "http://localhost"): string | null {
  if (!url) return null;
  try {
    return new URL(url, origin).searchParams.get("error");
  } catch {
    const match = url.match(/[?&]error=([^&#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}
