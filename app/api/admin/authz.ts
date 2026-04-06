import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

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

export async function verifySuperAdmin() {
  const session = await getServerSession(authOptions);

  if (!session) {
    throw new AuthzError("UNAUTHORIZED");
  }

  if (session.user?.email?.toLowerCase() !== "admin@bababuilds.com") {
    throw new AuthzError("FORBIDDEN", "Admin role required");
  }
}

export function handleAdminApiError(error: unknown, fallbackMessage = "Server Error") {
  if (error instanceof AuthzError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  console.error("Admin API Error:", error);
  return NextResponse.json(
    { error: fallbackMessage, code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
