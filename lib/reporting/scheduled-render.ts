import 'server-only';
import { prisma } from '@/lib/prisma';
import { getReport, reportToCsv, runReport } from '@/lib/reporting/engine';
import { buildReportPdf } from '@/lib/reporting/pdf';
import { pretty, reportEmailHtml, sanitizeParams } from '@/lib/reporting/views';

export type RenderedReportAttachment = {
  filename: string;
  contentType: 'text/csv' | 'application/pdf';
  data: string; // base64, served only over the authenticated worker loopback request
};
export type RenderedReportEmail = {
  schema: 1; subject: string; html: string; text: string;
  attachments: RenderedReportAttachment[];
};

const MAX_RESULT_ROWS = 2500;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;

/**
 * Render an already claimed report occurrence in the web process, because
 * Next's report engine isn't importable from the minimal standalone Node worker.
 * This never sends SMTP. No report bytes or recipient addresses enter Redis.
 * The caller must check the signed worker request and creator permissions.
 */
export async function renderQueuedReportEmail(
  v: {
    id: string; workspaceId: string; reportId: string; name: string;
    createdByUserId: string | null; paramsJson: unknown;
    scheduleFormat: string;
  },
  scheduledAt: Date,
): Promise<RenderedReportEmail> {
  if (!['PDF', 'CSV', 'BOTH'].includes(v.scheduleFormat) ||
      !Number.isFinite(scheduledAt.getTime()) ||
      !v.createdByUserId) throw new Error('INVALID_REPORT_RENDER_STATE');
  const def = getReport(v.reportId);
  if (!def) throw new Error('REPORT_GONE');
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId: v.workspaceId },
    select: {
      companyName: true, address: true, gstin: true, taxIdLabel: true,
      smtpHost: true, smtpUser: true, smtpPassword: true,
    },
  });
  if (!profile?.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }
  const result = await runReport(v.workspaceId, v.createdByUserId, {
    reportId: v.reportId, ...sanitizeParams(v.paramsJson),
  }, scheduledAt);
  if (!result || result.rows.length > MAX_RESULT_ROWS || result.columns.length > 40) {
    throw new Error('REPORT_RENDER_LIMIT');
  }
  const labels = Object.fromEntries([
    ...result.columns.map((c) => [c.key, pretty(c.key)]),
    ...result.kpis.map((k) => [k.key, pretty(k.key)]),
    ['total', 'Total'],
  ]);
  const stamp = scheduledAt.toISOString().slice(0, 10);
  const attachments: RenderedReportAttachment[] = [];
  let total = 0;
  const add = (filename: string, contentType: 'text/csv' | 'application/pdf', data: Buffer) => {
    if (data.byteLength > MAX_ATTACHMENT_BYTES ||
        total + data.byteLength > MAX_TOTAL_BYTES) {
      throw new Error('REPORT_ATTACHMENT_TOO_LARGE');
    }
    total += data.byteLength;
    attachments.push({ filename, contentType, data: data.toString('base64') });
  };
  if (v.scheduleFormat !== 'PDF') {
    add(def.id + '-' + stamp + '.csv', 'text/csv',
      Buffer.from(await reportToCsv(def, result, labels), 'utf8'));
  }
  if (v.scheduleFormat !== 'CSV') {
    const pdf = await buildReportPdf({
      title: v.name,
      company: { name: profile.companyName, address: profile.address,
        taxId: profile.gstin, taxIdLabel: profile.taxIdLabel },
      periodLabel: result.range?.key?.replace(/_/g, ' ') ?? stamp,
      result, labels,
    });
    add(def.id + '-' + stamp + '.pdf', 'application/pdf', Buffer.from(pdf));
  }
  const base = (process.env.NEXTAUTH_URL || 'https://erp.bababuilds.com').replace(/\/$/, '');
  const link = base + '/reporting/' + encodeURIComponent(v.reportId);
  const subject = v.name + ' · ' + stamp;
  const html = reportEmailHtml(v.name, result, link);
  if (subject.length > 500 || html.length > 150_000) throw new Error('REPORT_EMAIL_TOO_LARGE');
  return {
    schema: 1, subject, html, text: v.name + '\n' + link,
    attachments,
  };
}
