import { NextRequest, NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import { logActivity, validateTaxOverrideAuditChain } from "@/lib/security/activity-log";
import { containsInsensitive } from "@/lib/prisma-filters";

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
              { action: containsInsensitive(search) },
              { actorEmail: containsInsensitive(search) },
              { scopeType: containsInsensitive(search) },
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
        { action: containsInsensitive(search) },
        { actorEmail: containsInsensitive(search) },
        { entityType: containsInsensitive(search) },
        { ipAddress: containsInsensitive(search) },
      ];
    }
    if (statusFilter && statusFilter !== "ALL") {
      where.status = statusFilter;
    }
    const workspaceFilter = searchParams.get("workspaceId");
    if (workspaceFilter) where.workspaceId = workspaceFilter;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const createdAt: Record<string, Date> = {};
    if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) createdAt.lte = new Date(`${to}T23:59:59.999Z`);
    if (Object.keys(createdAt).length) where.createdAt = createdAt;

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

/**
 * DELETE: prune activity-log entries older than N days (minimum 30). It no longer wipes the whole log, and it never touches
 * the tax-override audit log: that one is a hash chain, and deleting from it breaks the chain that proves nothing was altered.
 */
export async function DELETE(req: NextRequest) {
  try {
    const admin = await verifySuperAdmin();

    const { searchParams } = new URL(req.url);
    if ((searchParams.get("type") ?? "activity") === "tax_audit") {
      return NextResponse.json({ error: "The tax audit log is tamper-evident and cannot be deleted.", code: "NOT_ALLOWED" }, { status: 405 });
    }
    const days = Number(searchParams.get("olderThanDays"));
    if (!Number.isInteger(days) || days < 30) {
      return NextResponse.json({ error: "Choose entries older than at least 30 days.", code: "INVALID_RETENTION" }, { status: 400 });
    }
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const { count } = await prisma.appActivityLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await logActivity({ action: "admin_logs_pruned", status: "SUCCESS", workspaceId: null, actor: { userId: admin.userId, email: admin.email }, entity: { type: "activity_log", id: null }, metadata: { olderThanDays: days, removed: count } });
    return NextResponse.json({ success: true, purged: count, olderThanDays: days });
  } catch (error) {
    return handleAdminApiError(error, "Failed to prune logs");
  }
}
