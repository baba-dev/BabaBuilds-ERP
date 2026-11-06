/**
 * app/api/team/access-log/route.ts
 *
 * Returns paginated RbacAuditLog events for the workspace "Access Activity" tab.
 * Only accessible to members with workspace.manage_members permission.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withPermission, RbacDeniedError, rbacDeniedResponse } from "@/lib/rbac";
import { ROLE_LABELS, isValidBusinessRole } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.workspaceId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId: string = session.workspaceId;
    const userId: string = session.user.id;

    // RBAC: requires manage_members to view the access log
    const permCheck = await withPermission(userId, workspaceId, "workspace.manage_members");
    if (!permCheck.granted) return permCheck.response;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
    const eventType = searchParams.get("eventType") ?? undefined;
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };
    if (eventType) where.eventType = eventType;

    const [logs, total] = await Promise.all([
      prisma.rbacAuditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.rbacAuditLog.count({ where }),
    ]);

    // Enrich role values with human-readable labels
    const enriched = logs.map((log) => ({
      ...log,
      previousRoleLabel: log.previousRole && isValidBusinessRole(log.previousRole)
        ? ROLE_LABELS[log.previousRole]
        : log.previousRole,
      newRoleLabel: log.newRole && isValidBusinessRole(log.newRole)
        ? ROLE_LABELS[log.newRole]
        : log.newRole,
    }));

    return NextResponse.json({
      data: enriched,
      meta: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit,
      },
    });
  } catch (err: unknown) {
    if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
    console.error("[team/access-log] Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
