import { NextRequest, NextResponse } from 'next/server';

import { logActivity } from '@/lib/security/activity-log';
import { offboardEmployee } from '@/lib/workforce/employee-service';
import { offboardSchema } from '@/lib/workforce/schemas';
import { readJson, requireWorkforce, workforceErrorResponse } from '../../../_guard';

/** Sets the last working day, makes the person inactive and cancels leave booked after it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireWorkforce('workforce.people.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const d = offboardSchema.parse(await readJson(req));
    const result = await offboardEmployee({ workspaceId: g.access.workspaceId, employeeId: id, exitDate: d.exitDate });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.employee_offboarded', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'employee', id }, metadata: { exitDate: d.exitDate, reason: d.reason ?? null, cancelledLeave: result.cancelledLeave } });
    return NextResponse.json({ employee: result.employee, cancelledLeave: result.cancelledLeave });
  } catch (error) {
    return workforceErrorResponse(error, 'employee.offboard');
  }
}
