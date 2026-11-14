import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { decrypt, encrypt } from '@/lib/encryption';
import type { SalaryComponent, TaxRegime } from '@/lib/payroll/engine/types';

export type CompensationInput = {
  effectiveFrom: Date;
  annualCtc: number;
  components: SalaryComponent[];
  taxRegime: TaxRegime;
  oldRegimeDeductions: number;
  pfEnabled: boolean;
  pfOnActualBasic: boolean;
  esiEnabled: boolean;
  ptState: string | null;
  pan?: string | null;
  uan?: string | null;
  esiNumber?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  ifsc?: string | null;
  accountNumber?: string | null;
  paymentMode: 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'UPI';
  note?: string | null;
};

const last4 = (v: string) => v.slice(-4);

/** Saves a new pay structure as a revision. Blank sensitive fields keep the previous value. */
export async function saveCompensation(args: { workspaceId: string; employeeId: string; userId: string; input: CompensationInput }) {
  const { workspaceId, employeeId, userId, input } = args;
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, workspaceId }, select: { id: true } });
  if (!employee) throw new PayrollNotFoundError('Employee not found.');

  const previous = await prisma.employeeCompensation.findFirst({
    where: { workspaceId, employeeId },
    orderBy: { effectiveFrom: 'desc' },
  });

  const pan = input.pan?.trim() ? input.pan.trim().toUpperCase() : null;
  const account = input.accountNumber?.trim() ? input.accountNumber.replace(/\s+/g, '') : null;

  const data = {
    workspaceId,
    employeeId,
    effectiveFrom: input.effectiveFrom,
    annualCtc: new Prisma.Decimal(input.annualCtc),
    componentsJson: input.components as unknown as Prisma.InputJsonValue,
    taxRegime: input.taxRegime,
    oldRegimeDeductions: new Prisma.Decimal(input.oldRegimeDeductions),
    pfEnabled: input.pfEnabled,
    pfOnActualBasic: input.pfOnActualBasic,
    esiEnabled: input.esiEnabled,
    ptState: input.ptState,
    panEnc: pan ? encrypt(pan) : (previous?.panEnc ?? null),
    panLast4: pan ? last4(pan) : (previous?.panLast4 ?? null),
    uan: input.uan?.trim() || previous?.uan || null,
    esiNumber: input.esiNumber?.trim() || previous?.esiNumber || null,
    accountHolder: input.accountHolder?.trim() || previous?.accountHolder || null,
    bankName: input.bankName?.trim() || previous?.bankName || null,
    ifsc: input.ifsc?.trim().toUpperCase() || previous?.ifsc || null,
    accountEnc: account ? encrypt(account) : (previous?.accountEnc ?? null),
    accountLast4: account ? last4(account) : (previous?.accountLast4 ?? null),
    paymentMode: input.paymentMode,
    note: input.note ?? null,
    createdByUserId: userId,
  };

  // Same effective date as the latest revision: correct it in place instead of stacking duplicates.
  if (previous && previous.effectiveFrom.getTime() === input.effectiveFrom.getTime()) {
    return prisma.employeeCompensation.update({ where: { id: previous.id }, data });
  }
  return prisma.employeeCompensation.create({ data });
}

export class PayrollNotFoundError extends Error {
  readonly code = 'NOT_FOUND';
}

type CompRow = Awaited<ReturnType<typeof prisma.employeeCompensation.findFirst>>;

export function parseComponents(json: unknown): SalaryComponent[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((c): SalaryComponent | null => {
      if (!c || typeof c !== 'object') return null;
      const o = c as Record<string, unknown>;
      const monthly = Number(o.monthly);
      if (typeof o.code !== 'string' || !Number.isFinite(monthly)) return null;
      return { code: o.code, label: typeof o.label === 'string' ? o.label : o.code, monthly, taxable: o.taxable !== false, prorate: o.prorate !== false, pfWage: o.pfWage === true };
    })
    .filter((c): c is SalaryComponent => c !== null);
}

/** What the screens may see: structure and identifiers, with PAN and account number masked. */
export function toPublicCompensation(row: NonNullable<CompRow>) {
  return {
    id: row.id,
    effectiveFrom: row.effectiveFrom.toISOString(),
    annualCtc: Number(row.annualCtc),
    components: parseComponents(row.componentsJson),
    taxRegime: (row.taxRegime === 'old' ? 'old' : 'new') as TaxRegime,
    oldRegimeDeductions: Number(row.oldRegimeDeductions),
    pfEnabled: row.pfEnabled,
    pfOnActualBasic: row.pfOnActualBasic,
    esiEnabled: row.esiEnabled,
    ptState: row.ptState,
    panLast4: row.panLast4,
    hasPan: Boolean(row.panEnc),
    uan: row.uan,
    esiNumber: row.esiNumber,
    accountHolder: row.accountHolder,
    bankName: row.bankName,
    ifsc: row.ifsc,
    accountLast4: row.accountLast4,
    hasAccount: Boolean(row.accountEnc),
    paymentMode: row.paymentMode,
    note: row.note,
  };
}

/** Bank details for a payment file. Only call from code gated on the post permission. */
export function revealBank(row: { accountEnc: string | null; accountHolder: string | null; bankName: string | null; ifsc: string | null }) {
  let account: string | null = null;
  try {
    account = row.accountEnc ? decrypt(row.accountEnc) : null;
  } catch {
    account = null;
  }
  return { account, holder: row.accountHolder, bankName: row.bankName, ifsc: row.ifsc };
}

export function revealPan(panEnc: string | null): string | null {
  try {
    return panEnc ? decrypt(panEnc) : null;
  } catch {
    return null;
  }
}

/** The revision in force on a given date: latest effectiveFrom on or before it. */
export function effectiveOn<T extends { effectiveFrom: Date }>(rows: T[], on: Date): T | null {
  let best: T | null = null;
  for (const r of rows) if (r.effectiveFrom <= on && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  return best;
}
