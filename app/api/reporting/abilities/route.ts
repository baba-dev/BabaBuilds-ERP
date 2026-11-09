import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { checkPermissionsSilent } from '@/lib/rbac';
import { reportingErrorResponse } from '@/app/api/reporting/_shared';

/**
 * Returns which reporting actions the current user may perform (for UI gating).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ canView: false, canRun: false, canExport: false, moduleEnabled: false });
    }

    const wu = await resolveSessionMembership(session);
    if (!wu?.workspaceId) {
      return Response.json({ canView: false, canRun: false, canExport: false, moduleEnabled: false });
    }

    let moduleEnabled = true;
    try {
      await requireModule(wu.workspaceId, 'REPORTING_CENTER');
    } catch (e) {
      if (e instanceof ModuleDisabledError) moduleEnabled = false;
      else throw e;
    }

    if (!moduleEnabled) {
      return Response.json({ canView: false, canRun: false, canExport: false, moduleEnabled: false });
    }

    const grants = await checkPermissionsSilent(session.user.id, wu.workspaceId, [
      'reporting_center.view',
      'reporting_center.query.run',
      'reporting_center.export',
    ]);
    const canView = grants['reporting_center.view'];
    const canRun = grants['reporting_center.query.run'];
    const canExport = grants['reporting_center.export'];

    return Response.json({ canView, canRun, canExport, moduleEnabled: true });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
