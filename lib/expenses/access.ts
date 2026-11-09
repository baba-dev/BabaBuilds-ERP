import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac";
import type { Permission } from "@/lib/permissions";

export type ExpenseCtx = { workspaceId: string; userId: string; email: string | null; countryCode: string };

export const expenseError = (status: number, code: string, message: string, extra?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });

/** Session plus a fresh permission check. Reading needs expenses.view; adding and editing need expenses.create; removing needs expenses.delete. */
export async function requireExpenseAccess(permission: Extract<Permission, "expenses.view" | "expenses.create" | "expenses.delete">): Promise<{ ok: true; ctx: ExpenseCtx } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId;
  const userId = (session?.user?.id as string | undefined) ?? null;
  if (!session || !workspaceId || !userId) return { ok: false, response: expenseError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { countryCode: true } });
  return { ok: true, ctx: { workspaceId, userId, email: session.user?.email ?? null, countryCode: ws?.countryCode ?? "IN" } };
}
