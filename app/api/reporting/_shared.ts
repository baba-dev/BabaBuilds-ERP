import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { RbacDeniedError, requirePermission } from '@/lib/rbac';

export async function resolveReportingContext(
  requiredPermission:
    | 'reporting_center.view'
    | 'reporting_center.query.run'
    | 'reporting_center.export',
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('UNAUTHORIZED');
  }

  const wu = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!wu?.workspaceId) {
    throw new Error('WORKSPACE_NOT_FOUND');
  }

  try {
    await requireModule(wu.workspaceId, 'REPORTING_CENTER');
  } catch (error) {
    if (error instanceof ModuleDisabledError) throw new Error('MODULE_DISABLED');
    throw error;
  }

  try {
    await requirePermission(session.user.id, wu.workspaceId, requiredPermission);
  } catch (error) {
    if (error instanceof RbacDeniedError) throw new Error('FORBIDDEN');
    throw error;
  }

  return { workspaceId: wu.workspaceId, userId: session.user.id };
}

export function reportingErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const map: Record<string, [number, string]> = {
    UNAUTHORIZED: [401, 'You must be signed in to access Reporting Center.'],
    WORKSPACE_NOT_FOUND: [400, 'Workspace context was not found.'],
    MODULE_DISABLED: [403, 'Reporting Center is disabled for this workspace.'],
    FORBIDDEN: [403, 'Your role does not have access to this reporting action.'],
    PRESET_NOT_FOUND: [404, 'Requested report preset was not found.'],
    INVALID_FILTERS: [400, 'One or more report filters are invalid.'],
    MISSING_SQL_PARAM: [400, 'Report parameters are incomplete for this preset.'],
    EMPTY_RESULT: [200, 'Report executed successfully with no rows.'],
    REPORT_TIMEOUT: [408, 'Report execution timed out. Please narrow your filters.'],
    REPORT_PAYLOAD_TOO_LARGE: [413, 'Report result is too large. Please narrow your filters.'],
  };

  const [status, userMessage] = map[message] ?? [500, 'Reporting request failed unexpectedly.'];
  return Response.json({ code: message, error: userMessage }, { status });
}
