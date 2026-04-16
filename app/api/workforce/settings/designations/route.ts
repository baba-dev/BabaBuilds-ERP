/**
 * app/api/workforce/settings/designations/route.ts
 * GET  — list designations
 * POST — create a designation
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

export async function GET(_req: NextRequest) {
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

    const designations = await prisma.designation.findMany({
      where: { workspaceId: wid },
      include: { _count: { select: { employees: true } } },
      orderBy: [{ level: "asc" }, { title: "asc" }],
    });

    return NextResponse.json({ designations });
  } catch (err) {
    console.error("[designations/GET]", err);
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

    const body = (await req.json()) as { title?: string; level?: number | null };
    const title = body.title?.trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const level = body.level == null ? null : Number(body.level);

    const designation = await prisma.designation.create({
      data: { workspaceId: wid, title, level: Number.isFinite(level as number) ? (level as number) : null },
    });
    return NextResponse.json(designation, { status: 201 });
  } catch (err) {
    console.error("[designations/POST]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

