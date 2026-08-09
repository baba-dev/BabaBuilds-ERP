import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function superAdminEmails(): Set<string> {
  const raw = process.env.SUPERADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

/**
 * Fail-closed platform super-admin check. Session claims are not sufficient:
 * the user role and email allowlist are re-read from trusted server state.
 */
export async function verifySuperAdmin(): Promise<{ userId: string; email: string }> {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;

  if (!session || !sessionUserId) {
    throw new AuthzError("UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { id: true, email: true, role: true },
  });
  const email = user?.email?.trim().toLowerCase();
  if (!user || user.role !== "ADMIN" || !email || !superAdminEmails().has(email)) {
    throw new AuthzError("FORBIDDEN", "Super-admin role required");
  }

  return { userId: user.id, email };
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
