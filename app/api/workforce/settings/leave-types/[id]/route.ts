/**
 * app/api/workforce/settings/leave-types/[id]/route.ts
 * PATCH  — update leave type
 * DELETE — delete leave type (only if unused)
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const body = (await req.json()) as Partial<{
      name: string;
      description: string | null;
      color: string;
      defaultDays: number;
      isPaid: boolean;
      isActive: boolean;
    }>;

    const leaveType = await prisma.leaveType.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? body.description.trim() : null } : {}),
        ...(body.color != null ? { color: body.color.trim() } : {}),
        ...(body.defaultDays != null && Number.isFinite(Number(body.defaultDays)) ? { defaultDays: Number(body.defaultDays) } : {}),
        ...(body.isPaid != null ? { isPaid: body.isPaid } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
    });

    return NextResponse.json(leaveType);
  } catch (err) {
    console.error("[leave-types/PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;

    const usage = await Promise.all([
      prisma.leaveRequest.count({ where: { workspaceId: wid, leaveTypeId: id } }),
      prisma.leaveBalance.count({ where: { workspaceId: wid, leaveTypeId: id } }),
    ]);
    if ((usage[0] ?? 0) > 0 || (usage[1] ?? 0) > 0) {
      return NextResponse.json({ error: "Cannot delete a leave type that is already in use" }, { status: 409 });
    }

    await prisma.leaveType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[leave-types/DELETE]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

