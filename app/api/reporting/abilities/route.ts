import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { checkPermission } from '@/lib/rbac';
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

    const wu = await prisma.workspaceUser.findFirst({
      where: { userId: session.user.id, isActive: true },
      orderBy: { joinedAt: 'asc' },
      select: { workspaceId: true },
    });
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

    const [canView, canRun, canExport] = await Promise.all([
      checkPermission(session.user.id, wu.workspaceId, 'reporting_center.view'),
      checkPermission(session.user.id, wu.workspaceId, 'reporting_center.query.run'),
      checkPermission(session.user.id, wu.workspaceId, 'reporting_center.export'),
    ]);

    return Response.json({ canView, canRun, canExport, moduleEnabled: true });
  } catch (error) {
    return reportingErrorResponse(error);
  }
}
