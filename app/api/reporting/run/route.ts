import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { runReport } from '@/lib/reporting/engine';
import { PERIOD_KEYS } from '@/lib/expenses/period';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

const schema = z.object({
  reportId: z.string().min(1).max(60),
  period: z.enum(PERIOD_KEYS as [string, ...string[]]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  compare: z.boolean().optional(),
});

/** Run one report for the current workspace and return rows, totals, key figures and a chart spec. */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.query.run');
    const limit = enforceRouteRateLimit({ request: req, route: '/api/reporting/run', scope: 'reporting-run', max: 90, windowMs: 60_000 });
    if (!limit.ok) return limit.response;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new Error('INVALID_INPUT');
    const started = Date.now();
    const result = await runReport(workspaceId, { ...parsed.data, period: parsed.data.period as never });
    if (!result) throw new Error('REPORT_NOT_FOUND');
    void prisma.appActivityLog.create({ data: { workspaceId, actorUserId: userId, action: 'REPORTING_RUN', entityType: 'REPORT', entityId: parsed.data.reportId, status: 'SUCCESS', metadata: { reportId: parsed.data.reportId, durationMs: Date.now() - started, rowCount: result.rows.length } } }).catch(() => null);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
