/**
 * app/api/workforce/settings/schedule/route.ts
 * GET   — fetch work schedule
 * PATCH — update work schedule
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

    const schedule = await prisma.workSchedule.findUnique({ where: { workspaceId: wid } });
    return NextResponse.json({ schedule });
  } catch (err) {
    console.error("[schedule/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
      workingDays: string[];
      workStartTime: string;
      workEndTime: string;
      timeZone: string;
    }>;

    const schedule = await prisma.workSchedule.upsert({
      where: { workspaceId: wid },
      update: {
        ...(body.workingDays ? { workingDays: JSON.stringify(body.workingDays) } : {}),
        ...(body.workStartTime ? { workStartTime: body.workStartTime } : {}),
        ...(body.workEndTime ? { workEndTime: body.workEndTime } : {}),
        ...(body.timeZone ? { timeZone: body.timeZone } : {}),
      },
      create: {
        workspaceId: wid,
        workingDays: body.workingDays ? JSON.stringify(body.workingDays) : undefined,
        workStartTime: body.workStartTime ?? undefined,
        workEndTime: body.workEndTime ?? undefined,
        timeZone: body.timeZone ?? undefined,
      },
    });

    return NextResponse.json({ schedule });
  } catch (err) {
    console.error("[schedule/PATCH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

