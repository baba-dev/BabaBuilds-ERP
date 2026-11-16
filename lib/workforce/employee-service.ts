import 'server-only';

import { prisma } from '@/lib/prisma';
import { ensureBalances, LeaveError } from './leave-service';
import { utcDay } from './calendar';

type Links = { departmentId?: string | null; designationId?: string | null; managerId?: string | null; userId?: string | null; email?: string | null };

/** Every foreign key must belong to this workspace; the manager chain must not loop back to the employee. */
export async function validateEmployeeLinks(workspaceId: string, links: Links, selfId?: string) {
  const bad = (field: string, msg: string) => new LeaveError('INVALID', msg, 422, { fields: { [field]: [msg] } });
  if (links.departmentId && !(await prisma.department.findFirst({ where: { id: links.departmentId, workspaceId }, select: { id: true } }))) throw bad('departmentId', 'That department does not exist.');
  if (links.designationId && !(await prisma.designation.findFirst({ where: { id: links.designationId, workspaceId }, select: { id: true } }))) throw bad('designationId', 'That designation does not exist.');
  if (links.managerId) {
    if (links.managerId === selfId) throw bad('managerId', 'A person cannot be their own manager.');
    if (!(await prisma.employee.findFirst({ where: { id: links.managerId, workspaceId }, select: { id: true } }))) throw bad('managerId', 'That manager does not exist.');
    // walk up the chain; reaching selfId means the new link would create a cycle
    let cursor: string | null = links.managerId;
    for (let i = 0; selfId && cursor && i < 50; i += 1) {
      if (cursor === selfId) throw bad('managerId', 'That would make a reporting loop.');
      cursor = (await prisma.employee.findUnique({ where: { id: cursor }, select: { managerId: true } }))?.managerId ?? null;
    }
  }
  if (links.userId) {
    if (!(await prisma.workspaceUser.findFirst({ where: { userId: links.userId, workspaceId, isActive: true }, select: { id: true } }))) throw bad('userId', 'That user is not an active member of this workspace.');
    const taken = await prisma.employee.findFirst({ where: { workspaceId, userId: links.userId, ...(selfId ? { id: { not: selfId } } : {}) }, select: { id: true } });
    if (taken) throw bad('userId', 'That user is already linked to another employee.');
  }
  if (links.email) {
    const dup = await prisma.employee.findFirst({ where: { workspaceId, email: links.email, status: { not: 'INACTIVE' }, ...(selfId ? { id: { not: selfId } } : {}) } , select: { id: true } });
    if (dup) throw bad('email', 'An active employee already uses that email.');
  }
}

/** Ends employment: sets the exit date, makes the person inactive, and cancels leave that starts after it. */
export async function offboardEmployee(args: { workspaceId: string; employeeId: string; exitDate: string; now?: Date }) {
  const emp = await prisma.employee.findFirst({ where: { id: args.employeeId, workspaceId: args.workspaceId }, select: { id: true, status: true, joinDate: true } });
  if (!emp) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
  const exit = utcDay(args.exitDate);
  if (emp.joinDate && exit < utcDay(emp.joinDate)) throw new LeaveError('INVALID', 'The last day cannot be before the joining date.', 422);
  const open = await prisma.leaveRequest.findMany({ where: { employeeId: emp.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { gt: exit } }, select: { id: true } });
  // Cancel through the service so balances are released correctly.
  const { cancelLeave } = await import('./leave-service');
  for (const r of open) await cancelLeave({ workspaceId: args.workspaceId, requestId: r.id, byUserId: 'system', isManager: true, now: args.now });
  const updated = await prisma.employee.update({ where: { id: emp.id }, data: { status: 'INACTIVE', exitDate: exit } });
  return { employee: updated, cancelledLeave: open.length };
}

export async function reactivateEmployee(args: { workspaceId: string; employeeId: string; now?: Date }) {
  const emp = await prisma.employee.findFirst({ where: { id: args.employeeId, workspaceId: args.workspaceId }, select: { id: true, status: true } });
  if (!emp) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
  if (emp.status !== 'INACTIVE') throw new LeaveError('INVALID', 'This person is already active.', 409);
  const updated = await prisma.employee.update({ where: { id: emp.id }, data: { status: 'ACTIVE', exitDate: null } });
  await ensureBalances(args.workspaceId, emp.id, (args.now ?? new Date()).getUTCFullYear());
  return updated;
}

const MAX_CODE_TRIES = 5;
/** Creates the employee, retrying with the next code if two people are added at once. */
export async function createEmployeeWithCode<T>(make: (code: string) => Promise<T>, nextCode: () => Promise<string>): Promise<T> {
  let last: unknown;
  for (let i = 0; i < MAX_CODE_TRIES; i += 1) {
    try { return await make(await nextCode()); } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      last = e;
    }
  }
  throw last;
}
