import { NextResponse } from 'next/server';

import { todayState } from '@/lib/workforce/attendance-service';
import { getEmployeeByUserId } from '@/lib/workforce/index';
import { requireWorkforce, workforceErrorResponse } from '../../_guard';

/** The signed-in person's check-in state for today, in the workplace's time zone. */
export async function GET() {
  try {
    const g = await requireWorkforce('workforce.attendance.view');
    if ('response' in g) return g.response;
    const me = await getEmployeeByUserId(g.access.workspaceId, g.access.userId);
    if (!me) return NextResponse.json({ linked: false });
    const state = await todayState(g.access.workspaceId, me.id);
    return NextResponse.json({ linked: true, employeeId: me.id, status: me.status, ...state });
  } catch (error) {
    return workforceErrorResponse(error, 'attendance.today');
  }
}
