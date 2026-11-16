import { NextRequest, NextResponse } from 'next/server';

import { logActivity } from '@/lib/security/activity-log';
import { reactivateEmployee } from '@/lib/workforce/employee-service';
import { requireWorkforce, workforceErrorResponse } from '../../../_guard';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireWorkforce('workforce.people.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const employee = await reactivateEmployee({ workspaceId: g.access.workspaceId, employeeId: id });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.employee_reactivated', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'employee', id } });
    return NextResponse.json(employee);
  } catch (error) {
    return workforceErrorResponse(error, 'employee.reactivate');
  }
}
