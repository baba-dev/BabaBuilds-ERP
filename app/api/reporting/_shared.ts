import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { ModuleDisabledError, requireModule } from '@/lib/modules';
import { RbacDeniedError, requirePermission } from '@/lib/rbac';

export async function resolveReportingContext(
  requiredPermission: 'reporting_center.view' | 'reporting_center.query.run' | 'reporting_center.export',
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('UNAUTHORIZED');
  const wu = await resolveSessionMembership(session);
  if (!wu?.workspaceId) throw new Error('WORKSPACE_NOT_FOUND');
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
  return { workspaceId: wu.workspaceId, userId: session.user.id, email: session.user.email ?? null };
}

export function reportingErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const map: Record<string, [number, string]> = {
    UNAUTHORIZED: [401, 'You must be signed in to access Reporting Center.'],
    WORKSPACE_NOT_FOUND: [400, 'Workspace context was not found.'],
    MODULE_DISABLED: [403, 'Reporting Center is disabled for this workspace.'],
    FORBIDDEN: [403, 'Your role does not have access to this reporting action.'],
    REPORT_NOT_FOUND: [404, 'That report does not exist.'],
    VIEW_NOT_FOUND: [404, 'That saved report was not found.'],
    INVALID_INPUT: [422, 'Check the highlighted fields.'],
  };
  const [status, userMessage] = map[message] ?? [500, 'Reporting request failed unexpectedly.'];
  if (!map[message]) console.error('[reporting]', error);
  return Response.json({ code: map[message] ? message : 'INTERNAL_ERROR', error: userMessage }, { status });
}
