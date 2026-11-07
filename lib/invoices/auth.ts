import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type InvoiceAccess = { workspaceId: string; userId: string; email: string | null };

/** Session + tenant + RBAC check shared by every /api/invoices/* route. */
export async function requireInvoiceAccess(
  permission: Permission,
): Promise<{ ok: true; access: InvoiceAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 }) };
  }
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, access: { workspaceId, userId, email: session.user?.email ?? null } };
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: { code, message, ...extra } }, { status });
}
