import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requireWorkforce, workforceErrorResponse } from '../../../_guard';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const r = await prisma.workforceHoliday.deleteMany({ where: { id, workspaceId: g.access.workspaceId } });
    if (r.count === 0) return NextResponse.json({ code: 'NOT_FOUND', error: 'Holiday not found.' }, { status: 404 });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.holiday_deleted', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'holiday', id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workforceErrorResponse(error, 'holidays.delete');
  }
}
