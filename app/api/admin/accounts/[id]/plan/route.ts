import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/security/activity-log";
import { handleAdminApiError, verifySuperAdmin } from "../../../authz";
import { PLAN_ACTIONS, planChange } from "@/lib/admin/plans";
import { enforceRouteRateLimit } from "@/lib/route-rate-limit";

const body = z.object({
  action: z.enum(PLAN_ACTIONS),
  plan: z.enum(["PRO", "TEAM"]).optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "TEAM_MONTHLY", "TEAM_YEARLY"]).optional(),
  days: z.number().int().min(1).max(730).optional(),
  /** Why. Written to the activity log next to who, what and the before/after. */
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(300),
});

/** Plan and access changes for one workspace. Every change needs a reason and is recorded with what it was before. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await verifySuperAdmin();
    const limit = enforceRouteRateLimit({ request, route: "/api/admin/accounts/plan", scope: "admin-plan", max: 30, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request", code: "INVALID_BODY" }, { status: 400 });

    const ws = await prisma.workspace.findUnique({ where: { id }, select: { id: true, name: true, subscriptionStatus: true, planTier: true, subscriptionEndsAt: true, planInterval: true } });
    if (!ws) return NextResponse.json({ error: "Workspace not found", code: "NOT_FOUND" }, { status: 404 });

    const change = planChange(parsed.data, ws);
    if ("error" in change) return NextResponse.json({ error: change.error, code: change.code }, { status: 409 });

    const updated = await prisma.workspace.update({ where: { id }, data: change.data, select: { subscriptionStatus: true, planTier: true, subscriptionEndsAt: true, planInterval: true } });
    await logActivity({
      action: `admin_plan_${parsed.data.action.toLowerCase()}`,
      status: "SUCCESS",
      workspaceId: id,
      actor: { userId: admin.userId, email: admin.email },
      entity: { type: "workspace", id },
      metadata: { summary: change.summary, reason: parsed.data.reason, before: { status: ws.subscriptionStatus, tier: ws.planTier, endsAt: ws.subscriptionEndsAt?.toISOString() ?? null }, after: { status: updated.subscriptionStatus, tier: updated.planTier, endsAt: updated.subscriptionEndsAt?.toISOString() ?? null } },
      request,
    });
    return NextResponse.json({ success: true, summary: change.summary, plan: { status: updated.subscriptionStatus, tier: updated.planTier, interval: updated.planInterval, endsAt: updated.subscriptionEndsAt?.toISOString() ?? null } });
  } catch (error) {
    return handleAdminApiError(error, "Plan change failed");
  }
}
