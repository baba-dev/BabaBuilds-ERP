import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getReport, reportAllowed, reportToCsv, runReport } from '@/lib/reporting/engine';
import { buildReportWorkbook, buildReportFilename } from '@/lib/reporting/export-xlsx';
import { buildReportPdf } from '@/lib/reporting/pdf';
import { PERIOD_KEYS } from '@/lib/expenses/period';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

const pretty = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const schema = z.object({
  reportId: z.string().min(1).max(60), format: z.enum(['xlsx', 'csv', 'pdf']).default('xlsx'),
  period: z.enum(PERIOD_KEYS as [string, ...string[]]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  compare: z.union([z.boolean(), z.enum(['previous', 'yoy'])]).optional(), spec: z.unknown().optional(),
  /** Column headings in the person's language; falls back to the English key. The PDF always uses English (its fonts are Latin only). */
  labels: z.record(z.string(), z.string().max(160)).optional(), title: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const limit = enforceRouteRateLimit({ request: req, route: '/api/reporting/export', scope: 'reporting-export', max: 20, windowMs: 10 * 60 * 1000 });
    if (!limit.ok) return limit.response;
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.export');
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new Error('INVALID_INPUT');
    const def = getReport(parsed.data.reportId);
    if (!def) throw new Error('REPORT_NOT_FOUND');
    if (!(await reportAllowed(def, userId, workspaceId))) throw new Error('FORBIDDEN');
    const result = await runReport(workspaceId, userId, { ...parsed.data, period: parsed.data.period as never });
    if (!result) throw new Error('REPORT_NOT_FOUND');
    const english = Object.fromEntries([...result.columns.map((c) => [c.key, pretty(c.key)]), ...result.kpis.map((k) => [k.key, pretty(k.key)]), ['total', 'Total']]);
    const labels: Record<string, string> = { ...english, ...(parsed.data.format === 'pdf' ? {} : (parsed.data.labels ?? {})) };
    const generatedAt = new Date();
    const stamp = generatedAt.toISOString().slice(0, 10);
    void prisma.appActivityLog.create({ data: { workspaceId, actorUserId: userId, action: 'REPORTING_EXPORT', entityType: 'REPORT', entityId: def.id, status: 'SUCCESS', metadata: { reportId: def.id, format: parsed.data.format, rowCount: result.rows.length } } }).catch(() => null);
    const base = { 'Cache-Control': 'no-store' };
    if (parsed.data.format === 'csv') return new Response(await reportToCsv(def, result, labels), { headers: { ...base, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${def.id}-${stamp}.csv"` } });
    const [workspace, profile] = await Promise.all([prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }), prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true, address: true, gstin: true, taxIdLabel: true } })]);
    const title = parsed.data.title?.trim() || def.title;
    if (parsed.data.format === 'pdf') {
      const bytes = await buildReportPdf({ title, company: { name: profile?.companyName ?? workspace?.name ?? 'Workspace', address: profile?.address, taxId: profile?.gstin, taxIdLabel: profile?.taxIdLabel }, periodLabel: result.range ? `${result.range.key.replace(/_/g, ' ')}${result.range.from ? ` (${result.range.from.slice(0, 10)} to ${(result.range.to ?? result.generatedAt).slice(0, 10)})` : ''}` : `As of ${stamp}`, result, labels });
      return new Response(Buffer.from(bytes), { headers: { ...base, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${def.id}-${stamp}.pdf"` } });
    }
    const rows = result.totals ? [...result.rows, Object.fromEntries(result.columns.map((c, i) => [c.key, i === 0 ? labels.total : result.totals![c.key]]))] : result.rows;
    const buffer = await buildReportWorkbook({ reportTitle: title, workspaceName: workspace?.name ?? 'Workspace', generatedAt, methodology: def.description, rows, columns: result.columns.map((c) => ({ key: c.key, label: labels[c.key] ?? pretty(c.key), format: c.format })) });
    return new Response(buffer, { headers: { ...base, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${buildReportFilename(def.id, generatedAt)}"` } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
