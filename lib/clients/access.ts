import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type ClientCtx = { workspaceId: string; userId: string | null; email: string | null; name: string; workspaceCountry: string };

export function clientError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });
}

/** Session plus a fresh permission check. Every client route goes through here: reading needs clients.view, changing needs clients.manage. */
export async function requireClientAccess(permission: Extract<Permission, "clients.view" | "clients.manage">): Promise<{ ok: true; ctx: ClientCtx } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = (session?.user?.id as string | undefined) ?? null;
  if (!session || !workspaceId || !userId) return { ok: false, response: clientError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } });
  return { ok: true, ctx: { workspaceId, userId, email: session.user?.email ?? null, name: session.user?.name || session.user?.email || "Someone", workspaceCountry: ws?.countryCode ?? "IN" } };
}
