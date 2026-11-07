/**
 * app/api/workforce/settings/leave-types/route.ts
 * GET  — list leave types
 * POST — create a leave type
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from "@/lib/rbac";
import { ModuleDisabledError, requireModule } from "@/lib/modules";

async function getWid(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export async function GET(__req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    try {
      await requireModule(wid, "WORKFORCE");
      await requirePermission(session.user.id, wid, "workforce.view");
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: "Module disabled" }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const leaveTypes = await prisma.leaveType.findMany({
      where: { workspaceId: wid },
      include: { _count: { select: { leaveBalances: true, leaveRequests: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ leaveTypes });
  } catch (err) {
    console.error("[leave-types/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    try {
      await requireModule(wid, "WORKFORCE");
      await requirePermission(session.user.id, wid, "workforce.settings.manage");
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: "Module disabled" }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = (await req.json()) as Partial<{
      name: string;
      code: string;
      description: string;
      color: string;
      defaultDays: number;
      isPaid: boolean;
      isActive: boolean;
    }>;

    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

    const leaveType = await prisma.leaveType.create({
      data: {
        workspaceId: wid,
        name,
        code,
        description: body.description?.trim() || null,
        color: body.color?.trim() || "indigo",
        defaultDays: Number.isFinite(Number(body.defaultDays)) ? Number(body.defaultDays) : 0,
        isPaid: body.isPaid ?? true,
        isActive: body.isActive ?? true,
      },
    });
    return NextResponse.json(leaveType, { status: 201 });
  } catch (err) {
    console.error("[leave-types/POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

