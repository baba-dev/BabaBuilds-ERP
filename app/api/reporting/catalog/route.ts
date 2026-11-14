import { listReports } from '@/lib/reporting/engine';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

/** The reports available to run. Titles are in English here; the app translates them by report id. */
export async function GET() {
  try {
    await resolveReportingContext('reporting_center.view');
    return Response.json({ reports: listReports() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
