import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type ProposalAccess = { workspaceId: string; userId: string; email: string | null };

export function proposalError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  // `error` stays a string for older callers; `code` is the stable machine-readable part.
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

/** Session + tenant + RBAC for every /api/proposals/* route. */
export async function requireProposalAccess(
  permission: Permission,
): Promise<{ ok: true; access: ProposalAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) {
    return { ok: false, response: proposalError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  }
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, access: { workspaceId, userId, email: session.user?.email ?? null } };
}
