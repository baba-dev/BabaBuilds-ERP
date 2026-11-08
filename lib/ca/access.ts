import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";
import { logActivity } from "@/lib/security/activity-log";

export type CaAccess = { workspaceId: string; userId: string; name: string; email: string | null };

export function caError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

/** Session plus a fresh permission check. Every CA route goes through here, exports included. */
export async function requireCaAccess(permission: Permission): Promise<{ ok: true; access: CaAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) return { ok: false, response: caError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, access: { workspaceId, userId, name: session.user?.name || session.user?.email || "User", email: session.user?.email ?? null } };
}

/** Audit trail for CA actions (who did what, to which record). Never throws. */
export async function auditCa(access: CaAccess, action: string, entity: { type: string; id?: string | null }, metadata?: Record<string, unknown>, request?: Request) {
  try {
    await logActivity({ action: `CA_${action}`, status: "SUCCESS", workspaceId: access.workspaceId, actor: { userId: access.userId, email: access.email ?? undefined }, entity, metadata, request });
  } catch (error) {
    console.error("CA audit log failed:", error);
  }
}
