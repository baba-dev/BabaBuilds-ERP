/**
 * Who may use the platform admin console. One rule, used by the page layout and every /api/admin route, so the page
 * can never open while its APIs refuse (the old layout checked one hard-coded email, the APIs checked role + allowlist).
 *
 * Fail-closed: a super admin is a user whose role is ADMIN in the database AND whose email is in SUPERADMIN_EMAILS.
 */
export type AdminUserRecord = { role: string | null; email: string | null } | null;

export type AdminDeniedReason =
  | "ANONYMOUS" // not signed in
  | "NOT_ADMIN" // an ordinary user: the console must look like it does not exist
  | "NOT_ADMIN_ROLE" // email is on the allowlist but the account's role is not ADMIN (setup gap)
  | "NOT_ALLOWLISTED"; // role is ADMIN but the email is not on the allowlist (setup gap)

export type AdminDecision = { ok: true; email: string } | { ok: false; reason: AdminDeniedReason; email: string | null };

export function parseAllowlist(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Pure decision, so every combination can be tested. `setupGap` reasons are shown to the person with a hint, never to strangers. */
export function decideAdminAccess(user: AdminUserRecord, allowlist: Set<string>, signedIn: boolean): AdminDecision {
  if (!signedIn || !user) return { ok: false, reason: "ANONYMOUS", email: null };
  const email = user.email?.trim().toLowerCase() ?? null;
  const isAdminRole = user.role === "ADMIN";
  const listed = !!email && allowlist.has(email);
  if (isAdminRole && listed && email) return { ok: true, email };
  if (isAdminRole && !listed) return { ok: false, reason: "NOT_ALLOWLISTED", email };
  if (!isAdminRole && listed) return { ok: false, reason: "NOT_ADMIN_ROLE", email };
  return { ok: false, reason: "NOT_ADMIN", email };
}

/** Reasons that tell an operator how to finish setting up, as opposed to a plain "no". */
export const isSetupGap = (r: AdminDeniedReason) => r === "NOT_ALLOWLISTED" || r === "NOT_ADMIN_ROLE";
