import { NextRequest, NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import { validateTaxOverrideAuditChain } from "@/lib/security/activity-log";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    await verifySuperAdmin();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "activity"; // "activity" | "tax_audit"
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const search = searchParams.get("search") ?? "";
    const statusFilter = searchParams.get("status") ?? "";
    const skip = (page - 1) * PAGE_SIZE;

    if (type === "tax_audit") {
      const where = search
        ? {
            OR: [
              { action: { contains: search } },
              { actorEmail: { contains: search } },
              { scopeType: { contains: search } },
            ],
          }
        : {};

      const [logs, total, integrity] = await Promise.all([
        prisma.taxRateOverrideAuditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            workspaceId: true,
            action: true,
            decisionSource: true,
            scopeType: true,
            scopeRef: true,
            rate: true,
            effectiveFrom: true,
            effectiveTo: true,
            reason: true,
            actorEmail: true,
            prevHash: true,
            entryHash: true,
            createdAt: true,
          },
        }),
        prisma.taxRateOverrideAuditLog.count({ where }),
        validateTaxOverrideAuditChain(),
      ]);

      return NextResponse.json({
        logs,
        total,
        page,
        pageSize: PAGE_SIZE,
        pages: Math.ceil(total / PAGE_SIZE),
        integrity,
      });
    }

    // Default: AppActivityLog
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { action: { contains: search } },
        { actorEmail: { contains: search } },
        { entityType: { contains: search } },
        { ipAddress: { contains: search } },
      ];
    }
    if (statusFilter && statusFilter !== "ALL") {
      where.status = statusFilter;
    }

    const [logs, total] = await Promise.all([
      prisma.appActivityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          workspaceId: true,
          actorUserId: true,
          actorEmail: true,
          action: true,
          entityType: true,
          entityId: true,
          status: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          correlationId: true,
          createdAt: true,
          workspace: {
            select: { name: true },
          },
        },
      }),
      prisma.appActivityLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize: PAGE_SIZE,
      pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (error) {
    return handleAdminApiError(error, "Failed to fetch logs");
  }
}

// DELETE: Purge all activity logs (super admin only)
export async function DELETE(req: NextRequest) {
  try {
    await verifySuperAdmin();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "activity";

    if (type === "tax_audit") {
      const { count } = await prisma.taxRateOverrideAuditLog.deleteMany({});
      return NextResponse.json({ success: true, purged: count });
    }

    const { count } = await prisma.appActivityLog.deleteMany({});
    return NextResponse.json({ success: true, purged: count });
  } catch (error) {
    return handleAdminApiError(error, "Failed to purge logs");
  }
}
