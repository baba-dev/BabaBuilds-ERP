import "server-only";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from "@/lib/rbac";
import { ModuleDisabledError, requireModule } from "@/lib/modules";
import type { Permission } from "@/lib/permissions";

export type CashFlowCtx = { workspaceId: string; userId: string; email: string | null };

export const cashFlowError = (status: number, code: string, message: string, extra?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...(extra ?? {}) }, { status });

/** Session, the Cash Flow module being on for the workspace, and a fresh permission check. Reading needs cash_flow.view; changing the model (assumptions, adjustments, accounts, alerts) needs cash_flow.manage_assumptions. */
export async function requireCashFlowAccess(permission: Extract<Permission, "cash_flow.view" | "cash_flow.manage_assumptions"> = "cash_flow.view"): Promise<{ ok: true; ctx: CashFlowCtx } | { ok: false; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  const workspaceId = session?.workspaceId as string | undefined;
  const userId = (session?.user?.id as string | undefined) ?? null;
  if (!session || !workspaceId || !userId) return { ok: false, response: cashFlowError(401, "AUTH_UNAUTHORIZED", "Unauthorized") };
  try {
    await requireModule(workspaceId, "CASH_FLOW");
  } catch (error) {
    if (error instanceof ModuleDisabledError) return { ok: false, response: cashFlowError(403, "MODULE_DISABLED", "Cash flow module is not enabled for this workspace.") };
    throw error;
  }
  const perm = await withPermission(userId, workspaceId, permission);
  if (!perm.granted) return { ok: false, response: perm.response };
  return { ok: true, ctx: { workspaceId, userId, email: session.user?.email ?? null } };
}
