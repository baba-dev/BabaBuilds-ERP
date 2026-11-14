import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type ReconCtx = { workspaceId: string; userId: string; email: string | null };

export const reconError = (status: number, code: string, message: string, extra?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });

/** Session plus a fresh permission check. Looking at bank data and importing needs reconciliation.import; changing matches, rules and settings needs reconciliation.commit. */
export async function requireReconAccess(permission: Extract<Permission, "reconciliation.import" | "reconciliation.commit">): Promise<{ ok: true; ctx: ReconCtx } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = (session?.user?.id as string | undefined) ?? null;
  if (!session || !workspaceId || !userId) return { ok: false, response: reconError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, ctx: { workspaceId, userId, email: session.user?.email ?? null } };
}
