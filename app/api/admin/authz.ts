import { NextResponse } from "next/server";
import { getAdminDecision } from "@/lib/admin/session";

export type AuthzCode = "UNAUTHORIZED" | "FORBIDDEN";

export class AuthzError extends Error {
  readonly status: 401 | 403;
  readonly code: AuthzCode;

  constructor(code: AuthzCode, message?: string) {
    super(message ?? (code === "UNAUTHORIZED" ? "Authentication required" : "Forbidden"));
    this.name = "AuthzError";
    this.code = code;
    this.status = code === "UNAUTHORIZED" ? 401 : 403;
  }
}

/**
 * Fail-closed platform super-admin check. Session claims are not sufficient:
 * the user role and email allowlist are re-read from trusted server state, with the same rule the admin pages use.
 */
export async function verifySuperAdmin(): Promise<{ userId: string; email: string }> {
  const decision = await getAdminDecision();
  if (decision.ok && decision.userId) return { userId: decision.userId, email: decision.email };
  if (!decision.ok && decision.reason === "ANONYMOUS") throw new AuthzError("UNAUTHORIZED");
  throw new AuthzError("FORBIDDEN", "Super-admin role required");
}

export function handleAdminApiError(error: unknown, fallbackMessage = "Server Error") {
  if (error instanceof AuthzError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("Admin API Error:", error);
  return NextResponse.json(
    { error: fallbackMessage, code: "INTERNAL_ERROR" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}
