import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { DEFAULT_WORKING_DAYS } from '@/lib/workforce/calendar';
import { scheduleSchema } from '@/lib/workforce/settings-schemas';
import { readJson, requireWorkforce, workforceErrorResponse } from '../../_guard';

export async function GET() {
  try {
    const g = await requireWorkforce('workforce.view');
    if ('response' in g) return g.response;
    const schedule = await prisma.workSchedule.findUnique({ where: { workspaceId: g.access.workspaceId } });
    return NextResponse.json({ schedule: schedule ?? { workingDays: JSON.stringify(DEFAULT_WORKING_DAYS), workStartTime: '09:00', workEndTime: '18:00', timeZone: 'Asia/Kolkata' } });
  } catch (error) {
    return workforceErrorResponse(error, 'schedule.get');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const b = scheduleSchema.parse(await readJson(req));
    const data = { ...(b.workingDays ? { workingDays: JSON.stringify(b.workingDays) } : {}), ...(b.workStartTime ? { workStartTime: b.workStartTime } : {}), ...(b.workEndTime ? { workEndTime: b.workEndTime } : {}), ...(b.timeZone ? { timeZone: b.timeZone } : {}) };
    const schedule = await prisma.workSchedule.upsert({ where: { workspaceId: g.access.workspaceId }, update: data, create: { workspaceId: g.access.workspaceId, ...data } });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.schedule_updated', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'work_schedule', id: schedule.id }, metadata: data });
    return NextResponse.json({ schedule });
  } catch (error) {
    return workforceErrorResponse(error, 'schedule.patch');
  }
}
