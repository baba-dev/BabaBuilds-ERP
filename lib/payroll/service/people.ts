import 'server-only';

import { prisma } from '@/lib/prisma';
import { PT_STATE_OPTIONS } from '@/lib/payroll/engine/statutory';
import { effectiveOn, parseComponents, toPublicCompensation } from './compensation';

export type PersonReadiness = 'READY' | 'ATTENTION' | 'NO_PAY_STRUCTURE';

export type PayrollPerson = {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string | null;
  departmentId: string | null;
  department: string | null;
  designationId: string | null;
  designation: string | null;
  status: string;
  joinDate: string | null;
  exitDate: string | null;
  linkedUser: boolean;
  readiness: PersonReadiness;
  gaps: ('NO_BANK' | 'NO_PAN' | 'NO_UAN' | 'NO_PT_STATE')[];
  pay: { annualCtc: number; monthlyGross: number; regime: 'new' | 'old'; effectiveFrom: string; bankName: string | null; accountLast4: string | null; paymentMode: string } | null;
};

export async function listPeople(workspaceId: string, now = new Date()) {
  const [employees, departments, designations] = await Promise.all([
    prisma.employee.findMany({
      where: { workspaceId },
      include: { department: { select: { name: true } }, designation: { select: { title: true } }, compensations: { orderBy: { effectiveFrom: 'desc' } } },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
      take: 5000,
    }),
    prisma.department.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.designation.findMany({ where: { workspaceId }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ]);

  const people: PayrollPerson[] = employees.map((e) => {
    const comp = effectiveOn(e.compensations, now) ?? e.compensations[e.compensations.length - 1] ?? null;
    const gaps: PayrollPerson['gaps'] = [];
    if (comp) {
      if (comp.paymentMode === 'BANK_TRANSFER' && !(comp.accountEnc && comp.ifsc)) gaps.push('NO_BANK');
      if (!comp.panEnc) gaps.push('NO_PAN');
      if (comp.pfEnabled && !comp.uan) gaps.push('NO_UAN');
      if (!comp.ptState) gaps.push('NO_PT_STATE');
    }
    const monthlyGross = comp ? parseComponents(comp.componentsJson).reduce((s, c) => s + c.monthly, 0) : 0;
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`.trim(),
      employeeCode: e.employeeCode,
      email: e.email,
      departmentId: e.departmentId,
      department: e.department?.name ?? null,
      designationId: e.designationId,
      designation: e.designation?.title ?? null,
      status: e.status,
      joinDate: e.joinDate?.toISOString() ?? null,
      exitDate: e.exitDate?.toISOString() ?? null,
      linkedUser: Boolean(e.userId),
      readiness: !comp ? 'NO_PAY_STRUCTURE' : gaps.length ? 'ATTENTION' : 'READY',
      gaps,
      pay: comp ? { annualCtc: Number(comp.annualCtc), monthlyGross, regime: comp.taxRegime === 'old' ? 'old' : 'new', effectiveFrom: comp.effectiveFrom.toISOString(), bankName: comp.bankName, accountLast4: comp.accountLast4, paymentMode: comp.paymentMode } : null,
    };
  });

  return { people, meta: { departments, designations, ptStates: PT_STATE_OPTIONS } };
}

export async function getPerson(workspaceId: string, id: string) {
  const e = await prisma.employee.findFirst({
    where: { id, workspaceId },
    include: { department: { select: { name: true } }, designation: { select: { title: true } }, compensations: { orderBy: { effectiveFrom: 'desc' } }, loans: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!e) return null;
  return {
    id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, phone: e.phone, employeeCode: e.employeeCode, status: e.status,
    joinDate: e.joinDate?.toISOString() ?? null, exitDate: e.exitDate?.toISOString() ?? null, location: e.location,
    departmentId: e.departmentId, department: e.department?.name ?? null, designationId: e.designationId, designation: e.designation?.title ?? null,
    revisions: e.compensations.map(toPublicCompensation),
    loans: e.loans.map((l) => ({ id: l.id, label: l.label, principal: Number(l.principal), emi: Number(l.emi), outstanding: Number(l.outstanding), status: l.status, startPeriod: l.startPeriod.toISOString() })),
  };
}
