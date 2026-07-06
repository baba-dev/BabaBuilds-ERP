import type { Account } from "next-auth";
import { sendActivityAlert } from "@/lib/security/alert-hooks";
import { HIGH_RISK_BUSINESS_ROLES } from "@/lib/permissions";

const DEFAULT_PHISHING_RESISTANT_PROVIDERS = ["google", "azure-ad", "okta", "passkey-login"];
const DEFAULT_MAGIC_LINK_EXCEPTION_EMAILS = ["admin@bababuilds.com"];

export const PASSWORD_LOGIN_PROVIDER_ID = "password-login";
export const PASSKEY_LOGIN_PROVIDER_ID = "passkey-login";

export type LoginProviderRisk = {
  provider: string;
  method: "passkey" | "google" | "password" | "email_magic_link" | "demo" | "enterprise_sso" | "unknown";
  phishingResistant: boolean;
  highRiskRestricted: boolean;
};

// HIGH_RISK_ROLES now references the authoritative set from lib/permissions.
// OWNER, ADMIN, and FINANCE_MANAGER require phishing-resistant authentication.
export const HIGH_RISK_ROLES = new Set([
  ...HIGH_RISK_BUSINESS_ROLES,
  // Also include legacy role strings for backward compatibility with session tokens
  "OWNER",
  "ADMIN",
]);
export const HIGH_RISK_MAGIC_LINK_ERROR_CODE = "HIGH_RISK_MAGIC_LINK_BLOCKED";
export const HIGH_RISK_PASSWORD_ERROR_CODE = "HIGH_RISK_PASSWORD_BLOCKED";
export const MFA_POLICY_ERROR_CODE = "MFA_POLICY_BLOCK";
export const HIGH_RISK_MAGIC_LINK_REASON =
  "Email magic links are disabled for high-privilege accounts (Owner, Admin, Finance Manager). Use Google or your configured enterprise SSO provider.";
export const HIGH_RISK_PASSWORD_REASON =
  "Password-only sign-in is disabled for high-privilege accounts (Owner, Admin, Finance Manager). Use a passkey or Google sign-in.";

export function getPhishingResistantProviders(): Set<string> {
  const configured = process.env.PHISHING_RESISTANT_PROVIDERS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured && configured.length > 0 ? configured : DEFAULT_PHISHING_RESISTANT_PROVIDERS);
}

function normalizeProvider(account: Account | null | undefined): string {
  return (account?.providerAccountId || account?.provider || "unknown").toLowerCase();
}

export function classifyLoginProvider(account: Account | null | undefined): LoginProviderRisk {
  const provider = normalizeProvider(account);
  const nextAuthProvider = account?.provider?.toLowerCase();
  const phishingResistantProviders = getPhishingResistantProviders();

  if (provider === PASSKEY_LOGIN_PROVIDER_ID || nextAuthProvider === PASSKEY_LOGIN_PROVIDER_ID) {
    return { provider, method: "passkey", phishingResistant: true, highRiskRestricted: false };
  }

  if (provider === "google" || nextAuthProvider === "google") {
    return {
      provider: "google",
      method: "google",
      phishingResistant: phishingResistantProviders.has("google"),
      highRiskRestricted: !phishingResistantProviders.has("google"),
    };
  }

  if (provider === PASSWORD_LOGIN_PROVIDER_ID || nextAuthProvider === PASSWORD_LOGIN_PROVIDER_ID) {
    return { provider, method: "password", phishingResistant: false, highRiskRestricted: true };
  }

  if (provider === "email" || nextAuthProvider === "email") {
    return { provider: "email", method: "email_magic_link", phishingResistant: false, highRiskRestricted: true };
  }

  if (provider === "demo-login" || nextAuthProvider === "demo-login") {
    return { provider, method: "demo", phishingResistant: false, highRiskRestricted: true };
  }

  return {
    provider,
    method: phishingResistantProviders.has(provider) ? "enterprise_sso" : "unknown",
    phishingResistant: phishingResistantProviders.has(provider) || (nextAuthProvider ? phishingResistantProviders.has(nextAuthProvider) : false),
    highRiskRestricted: !phishingResistantProviders.has(provider),
  };
}

export function isPhishingResistantSignIn(account: Account | null | undefined): boolean {
  return classifyLoginProvider(account).phishingResistant;
}

export function isPasswordOnlySignIn(account: Account | null | undefined): boolean {
  return classifyLoginProvider(account).method === "password";
}

export function getMagicLinkExceptionEmails(): Set<string> {
  const configured = process.env.MAGIC_LINK_EXCEPTION_EMAILS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured && configured.length > 0 ? configured : DEFAULT_MAGIC_LINK_EXCEPTION_EMAILS);
}

export function isMagicLinkExceptionEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getMagicLinkExceptionEmails().has(email.trim().toLowerCase());
}

export function hasHighRiskRole(roles: Array<string | null | undefined>): boolean {
  return roles.some((role) => !!role && HIGH_RISK_ROLES.has(role));
}

export function isEmailMagicLinkAllowedForRoles(
  roles: Array<string | null | undefined>,
  email?: string | null,
): boolean {
  if (isMagicLinkExceptionEmail(email)) return true;
  return !hasHighRiskRole(roles);
}

export async function alertElevatedPrivilegeGrant(input: {
  workspaceId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetEmail: string;
  targetRole: string;
}) {
  await sendActivityAlert({
    type: "ELEVATED_PRIVILEGE_GRANTED",
    severity: "critical",
    dedupeKey: `priv-grant:${input.workspaceId}:${input.targetEmail}:${input.targetRole}`,
    message: `High-privilege ERP role '${input.targetRole}' granted to ${input.targetEmail} in workspace ${input.workspaceId}.`,
    details: input,
  });
}
