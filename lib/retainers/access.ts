import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type RetainerAccess = { workspaceId: string; userId: string; email: string | null };

export function retainerError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

export async function requireRetainerAccess(
  permission: Permission,
): Promise<{ ok: true; access: RetainerAccess } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id as string | undefined;
  if (!session || !workspaceId || !userId) return { ok: false, response: retainerError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, access: { workspaceId, userId, email: session.user?.email ?? null } };
}
