import 'server-only';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { getReport, reportToCsv, runReport, type ReportResult } from '@/lib/reporting/engine';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/expenses/period';

export const viewSelect = { id: true, name: true, reportId: true, paramsJson: true, pinned: true, scheduleFrequency: true, scheduleRecipients: true, scheduleNextAt: true, scheduleLastAt: true, scheduleLastError: true, createdByUserId: true, createdAt: true } as const;

export type ViewParams = { period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean };
export const FREQUENCIES = ['WEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function sanitizeParams(raw: unknown): ViewParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return { period: PERIOD_KEYS.includes(r.period as PeriodKey) ? (r.period as PeriodKey) : 'this_fy', from: date(r.from), to: date(r.to), compare: r.compare === true };
}

/** Parse a comma or space separated list; returns null when any address is invalid or there are none or too many. */
export function parseRecipients(raw: unknown): string[] | null {
  const list = String(raw ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 10 || !list.every((e) => EMAIL.test(e))) return null;
  return [...new Set(list.map((e) => e.toLowerCase()))];
}

/** Weekly reports go out on Mondays at 06:00 UTC, monthly on the 1st; always strictly after `from`. */
export function nextRunAfter(frequency: Frequency, from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 6, 0, 0));
  if (frequency === 'WEEKLY') {
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 1);
    return d;
  }
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 6, 0, 0));
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const pretty = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const fmt = (v: unknown, f: string | undefined, cur: string) => (typeof v === 'number' ? (f === 'currency' ? `${cur} ${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : f === 'percent' ? `${v}%` : v.toLocaleString('en-IN')) : v == null ? '' : String(v));

function emailHtml(name: string, result: ReportResult, link: string): string {
  const kpis = result.kpis.map((k) => `<td style="padding:8px 14px;border:1px solid #e5e7eb"><div style="font-size:11px;color:#6b7280">${esc(pretty(k.key))}</div><div style="font-size:16px;font-weight:600">${esc(fmt(k.value, k.format, result.currency))}</div></td>`).join('');
  const head = result.columns.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(pretty(c.key))}</th>`).join('');
  const body = result.rows.slice(0, 15).map((r) => `<tr>${result.columns.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px">${esc(fmt(r[c.key], c.format, result.currency))}</td>`).join('')}</tr>`).join('');
  return `<div style="font-family:system-ui,sans-serif"><h2 style="margin:0 0 12px">${esc(name)}</h2><table style="border-collapse:collapse;margin-bottom:16px"><tr>${kpis}</tr></table><table style="border-collapse:collapse;width:100%"><tr>${head}</tr>${body}</table>${result.rows.length > 15 ? `<p style="font-size:12px;color:#6b7280">Showing 15 of ${result.rows.length} rows. The full report is attached.</p>` : ''}<p><a href="${esc(link)}">Open in BabaBuilds ERP</a></p></div>`;
}

export type RunDueResult = { due: number; sent: number; failed: number };

/** Email every saved report whose schedule has come due. A failure on one view is recorded on it and does not stop the rest. */
export async function runDueSchedules(now = new Date()): Promise<RunDueResult> {
  const due = await prisma.reportView.findMany({ where: { scheduleFrequency: { not: null }, scheduleNextAt: { lte: now } }, take: 200 });
  let sent = 0, failed = 0;
  for (const v of due) {
    const frequency = (FREQUENCIES as readonly string[]).includes(v.scheduleFrequency ?? '') ? (v.scheduleFrequency as Frequency) : null;
    if (!frequency) continue;
    const next = nextRunAfter(frequency, now);
    let file: string | null = null;
    try {
      const def = getReport(v.reportId);
      const recipients = parseRecipients(v.scheduleRecipients);
      if (!def || !recipients) throw new Error(!def ? 'REPORT_GONE' : 'NO_RECIPIENTS');
      const profile = await prisma.businessProfile.findUnique({ where: { workspaceId: v.workspaceId } });
      if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) throw new Error('SMTP_NOT_CONFIGURED');
      const result = await runReport(v.workspaceId, { reportId: v.reportId, ...sanitizeParams(v.paramsJson) }, now);
      if (!result) throw new Error('REPORT_GONE');
      const csv = await reportToCsv(def, result, Object.fromEntries(result.columns.map((c) => [c.key, pretty(c.key)])));
      file = path.join(os.tmpdir(), `report-${v.id}-${now.getTime()}.csv`);
      await fs.writeFile(file, csv, 'utf8');
      const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? '';
      await sendEmail({ route: 'user', profile, to: recipients.join(', '), subject: `${v.name} · ${now.toISOString().slice(0, 10)}`, html: emailHtml(v.name, result, `${base}/reporting/${v.reportId}`), text: `${v.name}\n${base}/reporting/${v.reportId}`, attachments: [{ filename: `${def.id}-${now.toISOString().slice(0, 10)}.csv`, path: file, contentType: 'text/csv' }] });
      await prisma.reportView.update({ where: { id: v.id }, data: { scheduleLastAt: now, scheduleNextAt: next, scheduleLastError: null } });
      sent += 1;
    } catch (error) {
      failed += 1;
      await prisma.reportView.update({ where: { id: v.id }, data: { scheduleNextAt: next, scheduleLastError: (error instanceof Error ? error.message : String(error)).slice(0, 200) } }).catch(() => null);
    } finally {
      if (file) await fs.rm(file, { force: true }).catch(() => null);
    }
  }
  return { due: due.length, sent, failed };
}
