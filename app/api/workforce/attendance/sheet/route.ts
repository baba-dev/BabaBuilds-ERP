import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { monthSheet } from '@/lib/workforce/attendance-service';
import { getEmployeeByUserId } from '@/lib/workforce/index';
import { can, requireWorkforce, workforceErrorResponse } from '../../_guard';

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
  month: z.coerce.number().int().min(1).max(12).default(new Date().getUTCMonth() + 1),
  departmentId: z.string().max(40).optional(),
});

/** Month grid: one row per employee, one code per day (present, late, leave, holiday, weekly off...). */
export async function GET(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.attendance.view');
    if ('response' in g) return g.response;
    const q = schema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const manager = await can(g.access, 'workforce.attendance.manage');
    const employeeIds = manager ? undefined : [(await getEmployeeByUserId(g.access.workspaceId, g.access.userId))?.id ?? '__none__'];
    const sheet = await monthSheet({ workspaceId: g.access.workspaceId, year: q.year, month: q.month, departmentId: q.departmentId, employeeIds });
    return NextResponse.json({ ...sheet, canManage: manager });
  } catch (error) {
    return workforceErrorResponse(error, 'attendance.sheet');
  }
}
