/**
 * app/api/workforce/settings/holidays/route.ts
 * GET  — list holidays
 * POST — create holiday
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

export async function GET(req: NextRequest) {
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

    const yearParam = req.nextUrl.searchParams.get("year");
    const year = yearParam ? Number(yearParam) : null;

    const holidays = await prisma.workforceHoliday.findMany({
      where: {
        workspaceId: wid,
        ...(Number.isFinite(year as number) ? { OR: [{ year: year as number }, { year: null }] } : {}),
      },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ holidays });
  } catch (err) {
    console.error("[holidays/GET]", err);
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

    const body = (await req.json()) as { name?: string; date?: string; isRecurring?: boolean; year?: number | null };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!body.date) return NextResponse.json({ error: "date is required" }, { status: 400 });

    const date = new Date(body.date);
    if (!Number.isFinite(date.getTime())) return NextResponse.json({ error: "date is invalid" }, { status: 400 });

    const holiday = await prisma.workforceHoliday.create({
      data: {
        workspaceId: wid,
        name,
        date,
        isRecurring: body.isRecurring ?? true,
        year: body.isRecurring ? null : (body.year ?? date.getUTCFullYear()),
      },
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (err) {
    console.error("[holidays/POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

