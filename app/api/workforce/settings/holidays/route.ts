/**
 * app/api/workforce/settings/holidays/route.ts
 * GET  — list holidays
 * POST — create holiday
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/security/activity-log";
import { utcDay } from "@/lib/workforce/calendar";
import { holidaySchema } from "@/lib/workforce/settings-schemas";
import { readJson, requireWorkforce, workforceErrorResponse } from "../../_guard";
import { prisma } from "@/lib/prisma";
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from "@/lib/rbac";
import { ModuleDisabledError, requireModule } from "@/lib/modules";
import { resolveSessionMembership } from '@/lib/workspace-scope';

// The workspace the user is in (session), not an arbitrary membership.
async function getWid(session: Parameters<typeof resolveSessionMembership>[0]) {
  return (await resolveSessionMembership(session))?.workspaceId ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const wid = await getWid(session);
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
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const d = holidaySchema.parse(await readJson(req));
    const date = utcDay(d.date);
    const dup = await prisma.workforceHoliday.findFirst({ where: { workspaceId: g.access.workspaceId, date, name: d.name }, select: { id: true } });
    if (dup) return NextResponse.json({ code: 'DUPLICATE', error: 'That holiday already exists.' }, { status: 409 });
    const holiday = await prisma.workforceHoliday.create({ data: { workspaceId: g.access.workspaceId, name: d.name, date, isRecurring: d.isRecurring, year: d.isRecurring ? null : date.getUTCFullYear() } });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.holiday_added', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'holiday', id: holiday.id }, metadata: { name: d.name, date: d.date } });
    return NextResponse.json(holiday, { status: 201 });
  } catch (error) {
    return workforceErrorResponse(error, 'holidays.create');
  }
}
