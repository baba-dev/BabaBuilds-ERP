import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { sendViewEmail } from '@/lib/reporting/views';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

/** Send this saved report now, to the person asking only, so a schedule can be tried before it goes to everyone. */
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.export');
    const limit = enforceRouteRateLimit({ request: req, route: '/api/reporting/views/send', scope: 'test-send', max: 10, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    if (!email) throw new Error('INVALID_INPUT');
    const { id } = await props.params;
    const v = await prisma.reportView.findFirst({ where: { id, workspaceId, OR: [{ visibility: 'WORKSPACE' }, { createdByUserId: userId }] } });
    if (!v) throw new Error('VIEW_NOT_FOUND');
    try {
      await sendViewEmail({ ...v, createdByUserId: userId }, new Date(), [email]);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SEND_FAILED';
      return Response.json({ error: code === 'SMTP_NOT_CONFIGURED' ? 'Set up email in Business Settings first.' : 'Could not send the test email.', code }, { status: code === 'SMTP_NOT_CONFIGURED' ? 400 : 502 });
    }
    return Response.json({ success: true, sentTo: email });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
