import { prisma } from '@/lib/prisma';
import { getReport, reportAllowed, runReport } from '@/lib/reporting/engine';
import { sanitizeParams } from '@/lib/reporting/views';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

/** Key figures of the reports someone pinned to the dashboard, newest pin first (at most six, run in parallel). */
export async function GET() {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.view');
    const views = await prisma.reportView.findMany({ where: { workspaceId, pinnedToDashboard: true, OR: [{ visibility: 'WORKSPACE' }, { createdByUserId: userId }] }, orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, name: true, reportId: true, paramsJson: true } });
    const cards = (await Promise.all(views.map(async (v) => {
      const def = getReport(v.reportId);
      if (!def || !(await reportAllowed(def, userId, workspaceId))) return null;
      const r = await runReport(workspaceId, userId, { reportId: v.reportId, ...sanitizeParams(v.paramsJson) }, new Date(), { interactiveCache: true }).catch(() => null);
      return r ? { id: v.id, name: v.name, reportId: v.reportId, currency: r.currency, kpis: r.kpis.slice(0, 3), insights: r.insights.slice(0, 1) } : null;
    }))).filter(Boolean);
    return Response.json({ cards }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
