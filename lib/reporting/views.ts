import 'server-only';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailer';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { reportQueueEnabled } from '@/lib/jobs/report-routing';
import { enqueueDueScheduledReport } from '@/lib/jobs/report-producer';
import { getReport, reportToCsv, runReport, type ReportResult } from '@/lib/reporting/engine';
import { buildReportPdf } from '@/lib/reporting/pdf';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/expenses/period';

export const viewSelect = { id: true, name: true, reportId: true, paramsJson: true, pinned: true, pinnedToDashboard: true, visibility: true, scheduleFrequency: true, scheduleRecipients: true, scheduleFormat: true, scheduleEnabled: true, scheduleHour: true, scheduleTz: true, scheduleNextAt: true, scheduleLastAt: true, scheduleLastError: true, createdByUserId: true, createdAt: true } as const;

export type ViewParams = { period?: PeriodKey; from?: string | null; to?: string | null; compare?: boolean | 'previous' | 'yoy'; spec?: unknown };
export const FREQUENCIES = ['WEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FORMATS = ['CSV', 'PDF', 'BOTH'] as const;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function sanitizeParams(raw: unknown): ViewParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return { period: PERIOD_KEYS.includes(r.period as PeriodKey) ? (r.period as PeriodKey) : 'this_fy', from: date(r.from), to: date(r.to), compare: r.compare === 'yoy' ? 'yoy' : r.compare === true || r.compare === 'previous' ? 'previous' : false, ...(r.spec && typeof r.spec === 'object' ? { spec: r.spec } : {}) };
}

/** Parse a comma or space separated list; returns null when any address is invalid or there are none or too many. */
export function parseRecipients(raw: unknown): string[] | null {
  const list = String(raw ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 10 || !list.every((e) => EMAIL.test(e))) return null;
  return [...new Set(list.map((e) => e.toLowerCase()))];
}

export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== 'string' || tz.length > 60) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

const parts = (tz: string, t: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t));
  const g = (k: string) => Number(p.find((x) => x.type === k)!.value);
  return { y: g('year'), m: g('month') - 1, d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
};
const offsetMs = (tz: string, t: number) => { const q = parts(tz, t); return Date.UTC(q.y, q.m, q.d, q.h, q.mi, q.s) - t; };
/** A wall-clock time in a time zone as a UTC instant (settles around daylight-saving changes). */
function localToUtc(tz: string, y: number, m: number, d: number, h: number): number {
  const guess = Date.UTC(y, m, d, h);
  const t1 = guess - offsetMs(tz, guess);
  return guess - offsetMs(tz, t1);
}

/** Weekly reports go out on Mondays, monthly on the 1st, at the chosen hour in the chosen time zone; always strictly after `from`. */
export function nextRunAfter(frequency: Frequency, from: Date, opts: { hour?: number; tz?: string } = {}): Date {
  const tz = validTimeZone(opts.tz) ?? 'UTC';
  const hour = Math.min(23, Math.max(0, Math.round(opts.hour ?? 7)));
  const start = parts(tz, from.getTime());
  for (let i = 0; i <= 62; i++) {
    const day = new Date(Date.UTC(start.y, start.m, start.d + i));
    const ok = frequency === 'WEEKLY' ? day.getUTCDay() === 1 : day.getUTCDate() === 1;
    if (!ok) continue;
    const at = localToUtc(tz, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour);
    if (at > from.getTime()) return new Date(at);
  }
  return new Date(from.getTime() + 7 * 86_400_000);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
export const pretty = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const fmt = (v: unknown, f: string | undefined, cur: string) => (typeof v === 'number' ? (f === 'currency' ? `${cur} ${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : f === 'percent' ? `${v}%` : v.toLocaleString('en-IN')) : v == null ? '' : String(v));

export function reportEmailHtml(name: string, result: ReportResult, link: string): string {
  const kpis = result.kpis.map((k) => `<td style="padding:8px 14px;border:1px solid #e5e7eb"><div style="font-size:11px;color:#6b7280">${esc(pretty(k.key))}</div><div style="font-size:16px;font-weight:600">${esc(fmt(k.value, k.format, result.currency))}</div></td>`).join('');
  const head = result.columns.map((c) => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${esc(pretty(c.key))}</th>`).join('');
  const body = result.rows.slice(0, 15).map((r) => `<tr>${result.columns.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px">${esc(fmt(r[c.key], c.format, result.currency))}</td>`).join('')}</tr>`).join('');
  const issues = result.quality.length ? `<p style="font-size:12px;color:#b45309">${esc(result.quality.map((q) => `${pretty(q.code)}: ${q.count}`).join(' | '))}</p>` : '';
  return `<div style="font-family:system-ui,sans-serif"><h2 style="margin:0 0 12px">${esc(name)}</h2><table style="border-collapse:collapse;margin-bottom:16px"><tr>${kpis}</tr></table>${issues}<table style="border-collapse:collapse;width:100%"><tr>${head}</tr>${body}</table>${result.rows.length > 15 ? `<p style="font-size:12px;color:#6b7280">Showing 15 of ${result.rows.length} rows. The full report is attached.</p>` : ''}<p><a href="${esc(link)}">Open in BabaBuilds ERP</a></p></div>`;
}

type ViewRowDb = { id: string; workspaceId: string; createdByUserId: string | null; name: string; reportId: string; paramsJson: unknown; scheduleFrequency: string | null; scheduleRecipients: string | null; scheduleFormat: string; scheduleLastError: string | null; scheduleHour: number; scheduleTz: string };

/** Build and email one saved report to its recipients (CSV, PDF or both). Throws a short code on failure so the schedule can record it. */
export async function sendViewEmail(v: ViewRowDb, now: Date, overrideTo?: string[]): Promise<void> {
  const def = getReport(v.reportId);
  const recipients = overrideTo ?? parseRecipients(v.scheduleRecipients);
  if (!def || !recipients) throw new Error(!def ? 'REPORT_GONE' : 'NO_RECIPIENTS');
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId: v.workspaceId } });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) throw new Error('SMTP_NOT_CONFIGURED');
  const userId = v.createdByUserId ?? '';
  const result = await runReport(v.workspaceId, userId, { reportId: v.reportId, ...sanitizeParams(v.paramsJson) }, now);
  if (!result) throw new Error('REPORT_GONE');
  const labels = Object.fromEntries([...result.columns.map((c) => [c.key, pretty(c.key)]), ...result.kpis.map((k) => [k.key, pretty(k.key)]), ['total', 'Total']]);
  const stamp = now.toISOString().slice(0, 10);
  const files: string[] = [];
  const attachments: Array<{ filename: string; path: string; contentType: string }> = [];
  try {
    if (v.scheduleFormat !== 'PDF') {
      const f = path.join(os.tmpdir(), `report-${v.id}-${now.getTime()}.csv`);
      await fs.writeFile(f, await reportToCsv(def, result, labels), 'utf8'); files.push(f);
      attachments.push({ filename: `${def.id}-${stamp}.csv`, path: f, contentType: 'text/csv' });
    }
    if (v.scheduleFormat !== 'CSV') {
      const f = path.join(os.tmpdir(), `report-${v.id}-${now.getTime()}.pdf`);
      await fs.writeFile(f, await buildReportPdf({ title: v.name, company: { name: profile.companyName, address: profile.address, taxId: profile.gstin, taxIdLabel: profile.taxIdLabel }, periodLabel: result.range ? `${result.range.key.replace(/_/g, ' ')}` : stamp, result, labels })); files.push(f);
      attachments.push({ filename: `${def.id}-${stamp}.pdf`, path: f, contentType: 'application/pdf' });
    }
    const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') ?? '';
    await sendEmail({ route: 'user', profile, to: recipients.join(', '), subject: `${v.name} · ${stamp}`, html: reportEmailHtml(v.name, result, `${base}/reporting/${v.reportId}`), text: `${v.name}\n${base}/reporting/${v.reportId}`, attachments });
  } finally {
    await Promise.all(files.map((f) => fs.rm(f, { force: true }).catch(() => null)));
  }
}

export type RunDueResult = { due: number; sent: number; queued: number; failed: number };

/** Email every saved report whose schedule has come due. A failure on one view is recorded on it, the team is told once per new failure, and the rest carry on. */
export async function runDueSchedules(now = new Date()): Promise<RunDueResult> {
  const due = await prisma.reportView.findMany({ where: { scheduleFrequency: { not: null }, scheduleEnabled: true, scheduleNextAt: { lte: now } }, take: 200 });
  let sent = 0, queued = 0, failed = 0;
  for (const v of due) {
    const frequency = (FREQUENCIES as readonly string[]).includes(v.scheduleFrequency ?? '') ? (v.scheduleFrequency as Frequency) : null;
    if (!frequency) continue;
    const next = nextRunAfter(frequency, now, { hour: v.scheduleHour, tz: v.scheduleTz });
    try {
      if (reportQueueEnabled(v.workspaceId)) {
        // CAS + source outbox + recipient intents commit together. Never send
        // via the legacy SMTP path after an ambiguous database outcome.
        const result = await enqueueDueScheduledReport(v, next);
        if (result === 'ENQUEUED') queued += 1;
        if (result === 'INVALID_RECIPIENTS') failed += 1;
        continue;
      }
      await sendViewEmail(v, now);
      await prisma.reportView.update({ where: { id: v.id }, data: { scheduleLastAt: now, scheduleNextAt: next, scheduleLastError: null } });
      sent += 1;
    } catch (error) {
      failed += 1;
      const code = (error instanceof Error ? error.message : String(error)).slice(0, 200);
      if (reportQueueEnabled(v.workspaceId)) {
        // A producer failure must NEVER advance the due clock. The outbox
        // transaction either committed atomically or rolled back; another
        // authorized cron pass may safely attempt the same occurrence.
        await prisma.reportView.updateMany({
          where: { id: v.id, workspaceId: v.workspaceId, scheduleNextAt: v.scheduleNextAt },
          data: { scheduleLastError: 'REPORT_QUEUE_WRITE_FAILED' },
        }).catch(() => null);
        continue;
      }
      await prisma.reportView.update({ where: { id: v.id }, data: { scheduleNextAt: next, scheduleLastError: code } }).catch(() => null);
      if (code !== v.scheduleLastError) {
        void dispatchNotification({ event: 'GST_REMINDER', workspaceId: v.workspaceId, data: { title: 'A scheduled report could not be sent', body: `"${v.name}" failed (${code}). Open it in Reporting Center to fix the schedule.`, actionUrl: `/reporting/${v.reportId}` } }).catch(() => null);
      }
    }
  }
  return { due: due.length, sent, queued, failed };
}
