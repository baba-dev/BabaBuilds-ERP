import { listPublicPresets } from '@/lib/reporting/presets';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

export async function GET() {
  try {
    await resolveReportingContext('reporting_center.view');
    return Response.json({ presets: listPublicPresets() });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
