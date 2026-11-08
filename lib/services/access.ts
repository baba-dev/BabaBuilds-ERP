import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";

export type ServiceAccess = { workspaceId: string; userId: string | null; email: string | null };

export function serviceError(status: number, code: string, message: string) {
  // `error` stays a string: the catalog form and older callers read `err.error`.
  return NextResponse.json({ error: message, code }, { status });
}

/**
 * Reading the catalog needs only a session (proposals, retainers and invoices all pick from it).
 * Changing it requires `invoices.edit`.
 */
export async function requireServiceAccess(mode: "read" | "write"): Promise<{ ok: true; access: ServiceAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  if (!session || !workspaceId) return { ok: false, response: serviceError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const userId = (session.user?.id as string | undefined) ?? null;

  if (mode === "write") {
    if (!userId) return { ok: false, response: serviceError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
    const perm = await withPermission(userId, workspaceId, "invoices.edit");
    if (!perm.granted) return { ok: false, response: perm.response };
  }
  return { ok: true, access: { workspaceId, userId, email: session.user?.email ?? null } };
}
