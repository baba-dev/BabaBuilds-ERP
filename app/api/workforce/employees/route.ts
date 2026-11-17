/**
 * GET  — list employees (search, department, status, pagination)
 * POST — add an employee
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { containsInsensitive } from '@/lib/prisma-filters';
import type { Prisma } from '@prisma/client';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { logActivity } from '@/lib/security/activity-log';
import { utcDay } from '@/lib/workforce/calendar';
import { createEmployeeWithCode, validateEmployeeLinks } from '@/lib/workforce/employee-service';
import { generateEmployeeCode } from '@/lib/workforce/index';
import { ensureBalances } from '@/lib/workforce/leave-service';
import { employeeCreateSchema } from '@/lib/workforce/schemas';
import { readJson, requireWorkforce, workforceErrorResponse } from '../_guard';

const listQuery = z.object({
  search: z.string().trim().max(80).optional(),
  department: z.string().max(40).optional(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.people.view');
    if ('response' in g) return g.response;
    const q = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const where: Prisma.EmployeeWhereInput = {
      workspaceId: g.access.workspaceId,
      ...(q.search ? { OR: [{ firstName: containsInsensitive(q.search) }, { lastName: containsInsensitive(q.search) }, { email: containsInsensitive(q.search) }, { employeeCode: containsInsensitive(q.search) }] } : {}),
      ...(q.department ? { departmentId: q.department } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        include: { department: { select: { id: true, name: true } }, designation: { select: { id: true, title: true } }, manager: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.employee.count({ where }),
    ]);
    return NextResponse.json({ employees, total, page: q.page, limit: q.limit, totalPages: Math.ceil(total / q.limit) });
  } catch (error) {
    return workforceErrorResponse(error, 'employees.list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.people.manage');
    if ('response' in g) return g.response;
    const { workspaceId, userId, email } = g.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/workforce/employees', scope: workspaceId, max: 60, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = employeeCreateSchema.parse(await readJson(req));
    await validateEmployeeLinks(workspaceId, d);
    const { joinDate, ...rest } = d;
    const employee = await createEmployeeWithCode(
      (employeeCode) => prisma.employee.create({
        data: { ...rest, workspaceId, employeeCode, joinDate: joinDate ? utcDay(joinDate) : utcDay(new Date()) },
        include: { department: { select: { id: true, name: true } }, designation: { select: { id: true, title: true } } },
      }),
      () => generateEmployeeCode(workspaceId),
    );
    await ensureBalances(workspaceId, employee.id, new Date().getUTCFullYear());
    void logActivity({ workspaceId, action: 'workforce.employee_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee', id: employee.id }, metadata: { code: employee.employeeCode } });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return workforceErrorResponse(error, 'employees.create');
  }
}
