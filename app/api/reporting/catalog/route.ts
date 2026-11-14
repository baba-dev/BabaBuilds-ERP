import { listReports, reportAllowed } from '@/lib/reporting/engine';
import { CUSTOM_REPORT_META } from '@/lib/reporting/builder';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

/** The reports this person may open, with where their numbers come from. Titles are in English; the app translates them by report id. */
export async function GET() {
  try {
    const { workspaceId, userId } = await resolveReportingContext('reporting_center.view');
    const { build: _b, ...custom } = CUSTOM_REPORT_META;
    const all = [...listReports(), custom];
    const allowed = await Promise.all(all.map((r) => reportAllowed(r, userId, workspaceId)));
    return Response.json({ reports: all.filter((_, i) => allowed[i]) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
