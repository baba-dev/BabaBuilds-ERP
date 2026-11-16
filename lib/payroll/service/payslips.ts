import 'server-only';

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { getRunDetail, type RunLineDto } from './detail';
import { buildPayslipPdf } from './payslip-pdf';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Detail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>;

export async function renderPayslip(workspaceId: string, detail: Detail, line: RunLineDto): Promise<{ pdf: Uint8Array; filename: string }> {
  const [profile, workspace, snap] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true, address: true, gstin: true } }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
    prisma.payrollEmployeeSnapshot.findFirst({ where: { runId: detail.id, employeeId: line.employee.id }, select: { compensationMeta: true } }),
  ]);
  const meta = (snap?.compensationMeta ?? {}) as { panLast4?: string; uan?: string };
  const start = new Date(detail.period.startDate);
  const daysInMonth = Math.round((new Date(detail.period.endDate).getTime() - start.getTime()) / 86_400_000) + 1;
  const monthLabel = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pdf = await buildPayslipPdf({
    company: { name: profile?.companyName ?? workspace?.name ?? 'Company', address: profile?.address, gstin: profile?.gstin },
    monthLabel, line, daysInMonth, paidDays: Math.max(0, daysInMonth - Math.ceil(line.lopDays)), identifiers: { panLast4: meta.panLast4, uan: meta.uan },
  });
  const slug = line.employee.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'employee';
  return { pdf, filename: `payslip-${start.toISOString().slice(0, 7)}-${slug}.pdf` };
}

export type SendResult = { sent: number; skipped: { name: string; reason: 'NO_EMAIL' | 'ALREADY_SENT' }[]; failed: { name: string }[] };

/** Emails each employee their own payslip PDF. Employees without an email, or already sent, are skipped and reported. */
export async function sendPayslips(args: { workspaceId: string; runId: string; userId: string; lineIds?: string[]; resend?: boolean }): Promise<SendResult> {
  const { workspaceId } = args;
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) throw Object.assign(new Error('Set up email in Business Settings before sending payslips.'), { code: 'SMTP_NOT_CONFIGURED' });
  const detail = await getRunDetail(workspaceId, args.userId, args.runId);
  if (!detail) throw Object.assign(new Error('Payroll run not found.'), { code: 'NOT_FOUND' });
  if (detail.status !== 'POSTED' && detail.status !== 'APPROVED') throw Object.assign(new Error('Payslips can be sent once the run is approved.'), { code: 'NOT_APPROVED' });

  const result: SendResult = { sent: 0, skipped: [], failed: [] };
  const lines = detail.lines.filter((l) => !args.lineIds?.length || args.lineIds.includes(l.id));
  const month = new Date(detail.period.startDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  for (const l of lines) {
    if (!l.employee.email) { result.skipped.push({ name: l.employee.name, reason: 'NO_EMAIL' }); continue; }
    if (l.payslipSentAt && !args.resend) { result.skipped.push({ name: l.employee.name, reason: 'ALREADY_SENT' }); continue; }
    const file = path.join(os.tmpdir(), `payslip-${l.id}-${Date.now()}.pdf`);
    try {
      const { pdf, filename } = await renderPayslip(workspaceId, detail, l);
      await fs.writeFile(file, pdf);
      await sendEmail({
        route: 'user', profile, to: l.employee.email, subject: `Your payslip for ${month}`,
        html: `<div style="font-family:system-ui,sans-serif"><p>Hi ${esc(l.employee.name.split(' ')[0] ?? '')},</p><p>Your payslip for <strong>${esc(month)}</strong> is attached. Net pay: <strong>INR ${money(l.netPay)}</strong>.</p><p style="color:#6b7280;font-size:12px">This message contains pay details. Please do not forward it.</p></div>`,
        text: `Your payslip for ${month} is attached. Net pay: INR ${money(l.netPay)}.`,
        attachments: [{ filename, path: file, contentType: 'application/pdf' }],
      });
      await prisma.payrollLineItem.update({ where: { id: l.id }, data: { payslipSentAt: new Date() } });
      result.sent += 1;
    } catch (err) {
      console.error('[payroll/payslip-email]', err);
      result.failed.push({ name: l.employee.name });
    } finally {
      await fs.rm(file, { force: true }).catch(() => null);
    }
  }
  return result;
}
