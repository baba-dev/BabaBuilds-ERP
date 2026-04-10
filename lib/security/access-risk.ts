import type { Account } from "next-auth";
import { sendActivityAlert } from "@/lib/security/alert-hooks";

const DEFAULT_PHISHING_RESISTANT_PROVIDERS = ["google", "azure-ad", "okta"];

export const HIGH_RISK_ROLES = new Set(["OWNER", "ADMIN"]);

export function getPhishingResistantProviders(): Set<string> {
  const configured = process.env.PHISHING_RESISTANT_PROVIDERS
    ?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured && configured.length > 0 ? configured : DEFAULT_PHISHING_RESISTANT_PROVIDERS);
}

export function isPhishingResistantSignIn(account: Account | null | undefined): boolean {
  if (!account?.provider) return false;
  return getPhishingResistantProviders().has(account.provider.toLowerCase());
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
    message: `High-privilege role ${input.targetRole} granted to ${input.targetEmail}.`,
    details: input,
  });
}
