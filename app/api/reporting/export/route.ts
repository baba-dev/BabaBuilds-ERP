import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getReport, reportToCsv, runReport } from '@/lib/reporting/engine';
import { buildReportFilename, buildReportWorkbook } from '@/lib/reporting/export-xlsx';
import { PERIOD_KEYS } from '@/lib/expenses/period';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

const pretty = (k: string) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const schema = z.object({
  reportId: z.string().min(1).max(60), format: z.enum(['xlsx', 'csv']).default('xlsx'),
  period: z.enum(PERIOD_KEYS as [string, ...string[]]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  /** Column headings in the person's language; falls back to the English key. */
  labels: z.record(z.string(), z.string().max(80)).optional(),
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
    const result = await runReport(workspaceId, { ...parsed.data, period: parsed.data.period as never });
    if (!result) throw new Error('REPORT_NOT_FOUND');
    const labels: Record<string, string> = { ...Object.fromEntries(result.columns.map((c) => [c.key, pretty(c.key)])), total: 'Total', ...(parsed.data.labels ?? {}) };
    const generatedAt = new Date();
    void prisma.appActivityLog.create({ data: { workspaceId, actorUserId: userId, action: 'REPORTING_EXPORT', entityType: 'REPORT', entityId: def.id, status: 'SUCCESS', metadata: { reportId: def.id, format: parsed.data.format, rowCount: result.rows.length } } }).catch(() => null);
    if (parsed.data.format === 'csv') {
      return new Response(await reportToCsv(def, result, labels), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${def.id}-${generatedAt.toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
    }
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const rows = result.totals ? [...result.rows, Object.fromEntries(result.columns.map((c, i) => [c.key, i === 0 ? labels.total : result.totals![c.key]]))] : result.rows;
    const buffer = await buildReportWorkbook({ reportTitle: def.title, workspaceName: workspace?.name ?? 'Workspace', generatedAt, methodology: def.description, rows, columns: result.columns.map((c) => ({ key: c.key, label: labels[c.key] ?? pretty(c.key), format: c.format })) });
    return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${buildReportFilename(def.id, generatedAt)}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
