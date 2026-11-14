import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { reportingErrorResponse, resolveReportingContext } from '@/app/api/reporting/_shared';

/** Turn a share link off. It stops working immediately. */
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const { workspaceId, userId, email } = await resolveReportingContext('reporting_center.export');
    const { id } = await props.params;
    const res = await prisma.reportShare.updateMany({ where: { id, workspaceId, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    if (!res.count) throw new Error('VIEW_NOT_FOUND');
    void logActivity({ workspaceId, action: 'reporting.share_revoked', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'report_share', id } });
    return Response.json({ success: true });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
