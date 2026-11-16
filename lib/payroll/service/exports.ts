import 'server-only';

import ExcelJS from 'exceljs';
import { revealBank } from './compensation';
import type { RunDetailDto } from './detail';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

const csvCell = (v: string | number | null | undefined) => {
  const s = String(v ?? '');
  // Cells starting with these characters can run as formulas in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const monthName = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

type Run = NonNullable<RunDetailDto>;

/** Bank upload sheet: one row per employee paid by bank transfer. Account numbers are decrypted here only. */
export async function bankAdvice(workspaceId: string, run: Run) {
  const snapshots = await prisma.payrollEmployeeSnapshot.findMany({ where: { run: { id: run.id, workspaceId } }, select: { employeeId: true, compensationMeta: true } });
  const meta = new Map(snapshots.map((s) => [s.employeeId, (s.compensationMeta ?? {}) as { bank?: { holder: string; bankName: string; ifsc: string; accountEnc: string }; paymentMode?: string }]));
  const rows: (string | number)[][] = [['Sr', 'Beneficiary name', 'Account number', 'IFSC', 'Amount', 'Narration', 'Employee code']];
  const skipped: { name: string; reason: string }[] = [];
  let total = 0;
  let i = 0;
  for (const l of run.lines) {
    if (l.payoutStatus === 'PAID' || l.netPay <= 0) continue;
    const m = meta.get(l.employee.id);
    if ((m?.paymentMode ?? 'BANK_TRANSFER') !== 'BANK_TRANSFER') { skipped.push({ name: l.employee.name, reason: 'NOT_BANK_TRANSFER' }); continue; }
    const bank = m?.bank?.accountEnc ? revealBank({ accountEnc: m.bank.accountEnc, accountHolder: m.bank.holder, bankName: m.bank.bankName, ifsc: m.bank.ifsc }) : null;
    if (!bank?.account || !bank.ifsc) { skipped.push({ name: l.employee.name, reason: 'NO_BANK_DETAILS' }); continue; }
    i += 1;
    total += l.netPay;
    rows.push([i, bank.holder || l.employee.name, bank.account, bank.ifsc, l.netPay.toFixed(2), `Salary ${monthName(run.period.startDate)}`, l.employee.code ?? '']);
  }
  return { csv: csv(rows), count: i, total: Math.round(total * 100) / 100, skipped };
}

/** EPFO electronic challan cum return text file (ECR), one line per member with a UAN. */
export async function pfEcr(workspaceId: string, run: Run) {
  const snapshots = await prisma.payrollEmployeeSnapshot.findMany({ where: { run: { id: run.id, workspaceId } }, select: { employeeId: true, compensationMeta: true } });
  const uan = new Map(snapshots.map((s) => [s.employeeId, ((s.compensationMeta ?? {}) as { uan?: string }).uan ?? null]));
  const lines: string[] = [];
  const skipped: string[] = [];
  for (const l of run.lines) {
    const s = l.statutory;
    if (!(s.pfEmployee > 0)) continue;
    const id = uan.get(l.employee.id);
    if (!id) { skipped.push(l.employee.name); continue; }
    const epsWage = Math.min(s.pfWage, 15000);
    lines.push([id, l.employee.name.toUpperCase().replace(/[^A-Z .]/g, ''), Math.round(l.gross), Math.round(s.pfWage), Math.round(epsWage), Math.round(epsWage), s.pfEmployee, s.pfEps, s.pfEpf, Math.round(l.lopDays), 0].join('#~#'));
  }
  return { text: lines.join('\r\n') + (lines.length ? '\r\n' : ''), count: lines.length, skipped };
}

/** ESI monthly contribution upload: one row per insured person. */
export async function esiSheet(workspaceId: string, run: Run) {
  const snapshots = await prisma.payrollEmployeeSnapshot.findMany({ where: { run: { id: run.id, workspaceId } }, select: { employeeId: true, compensationMeta: true } });
  const num = new Map(snapshots.map((s) => [s.employeeId, ((s.compensationMeta ?? {}) as { esiNumber?: string }).esiNumber ?? null]));
  const days = Math.round((new Date(run.period.endDate).getTime() - new Date(run.period.startDate).getTime()) / 86_400_000) + 1;
  const rows: (string | number)[][] = [['IP Number', 'IP Name', 'No of days for which wages paid', 'Total monthly wages', 'Reason code for zero workings days', 'Last working day']];
  const skipped: string[] = [];
  let count = 0;
  for (const l of run.lines) {
    if (!(l.statutory.esiWage > 0)) continue;
    const ip = num.get(l.employee.id);
    if (!ip) { skipped.push(l.employee.name); continue; }
    count += 1;
    rows.push([ip, l.employee.name, Math.max(0, days - Math.ceil(l.lopDays)), Math.round(l.statutory.esiWage), '', '']);
  }
  return { csv: csv(rows), count, skipped };
}

/** The payroll register: every employee, every earning and deduction, and the totals. */
export async function registerWorkbook(run: Run, company: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payroll register', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
  const earnCodes = [...new Set(run.lines.flatMap((l) => l.earnings.map((e) => e.code)))];
  const earnLabel = new Map(run.lines.flatMap((l) => l.earnings.map((e) => [e.code, e.label] as const)));
  const dedCodes = [...new Set(run.lines.flatMap((l) => l.deductionLines.map((e) => e.code)))];
  const dedLabel = new Map(run.lines.flatMap((l) => l.deductionLines.map((e) => [e.code, e.label] as const)));
  const head = ['Code', 'Employee', 'Department', 'Loss of pay days', ...earnCodes.map((c) => earnLabel.get(c) ?? c), 'Gross pay', ...dedCodes.map((c) => dedLabel.get(c) ?? c), 'Total deductions', 'Net pay', 'Employer cost'];
  ws.addRow([company]).font = { bold: true, size: 14 };
  ws.addRow([`Payroll register: ${monthName(run.period.startDate)}`]).font = { color: { argb: 'FF666666' } };
  ws.addRow([]);
  const header = ws.addRow(head);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  for (const l of run.lines) {
    const e = new Map(l.earnings.map((x) => [x.code, x.amount]));
    const d = new Map(l.deductionLines.map((x) => [x.code, x.amount]));
    ws.addRow([l.employee.code ?? '', l.employee.name, l.employee.department ?? '', l.lopDays, ...earnCodes.map((c) => e.get(c) ?? 0), l.gross, ...dedCodes.map((c) => d.get(c) ?? 0), l.deductions, l.netPay, l.employerCost]);
  }
  const first = 5, last = 4 + run.lines.length;
  const totalRow = ws.addRow(['', 'Total', '', '', ...head.slice(4).map((_, i) => { const col = ws.getColumn(5 + i).letter; return { formula: `SUM(${col}${first}:${col}${last})` }; })]);
  totalRow.font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 26 : i === 2 ? 18 : 14; if (i >= 3) c.numFmt = '#,##0.00'; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function safePan(panEnc: string | null) {
  try { return panEnc ? decrypt(panEnc) : null; } catch { return null; }
}
