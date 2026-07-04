import type { Account } from "next-auth";
import { sendActivityAlert } from "@/lib/security/alert-hooks";
import { HIGH_RISK_BUSINESS_ROLES } from "@/lib/permissions";

const DEFAULT_PHISHING_RESISTANT_PROVIDERS = ["google", "azure-ad", "okta", "passkey-login"];
const DEFAULT_MAGIC_LINK_EXCEPTION_EMAILS = ["admin@bababuilds.com"];

// HIGH_RISK_ROLES now references the authoritative set from lib/permissions.
// OWNER, ADMIN, and FINANCE_MANAGER require phishing-resistant authentication.
export const HIGH_RISK_ROLES = new Set([
  ...HIGH_RISK_BUSINESS_ROLES,
  // Also include legacy role strings for backward compatibility with session tokens
  "OWNER",
  "ADMIN",
]);
export const HIGH_RISK_MAGIC_LINK_ERROR_CODE = "HIGH_RISK_MAGIC_LINK_BLOCKED";
export const HIGH_RISK_MAGIC_LINK_REASON =
  "Email magic links are disabled for high-privilege accounts (Owner, Admin, Finance Manager). Use Google or your configured enterprise SSO provider.";

export function getPhishingResistantProviders(): Set<string> {
  const configured = process.env.PHISHING_RESISTANT_PROVIDERS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured && configured.length > 0 ? configured : DEFAULT_PHISHING_RESISTANT_PROVIDERS);
}

export function isPhishingResistantSignIn(account: Account | null | undefined): boolean {
  if (!account?.provider) return false;
  const provider = account.provider.toLowerCase();
  const providerAccountId = account.providerAccountId?.toLowerCase();
  return getPhishingResistantProviders().has(provider) || providerAccountId === "passkey-login";
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
