import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { NextResponse } from 'next/server';
import { ModuleDisabledError, requireModule } from '@/lib/modules';

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'FINANCE_MANAGER']);

export async function requireImportContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('UNAUTHORIZED');

  const membership = await resolveSessionMembership(session);

  if (!membership?.workspaceId) throw new Error('NO_WORKSPACE');
  await requireModule(membership.workspaceId, 'IMPORT_MANAGER');

  const role = membership.businessRole ?? membership.role;
  if (!ALLOWED_ROLES.has(role)) throw new Error('FORBIDDEN');

  return { workspaceId: membership.workspaceId, userId: session.user.id, role };
}

/** Maps the errors the import routes throw to a status and a message people can act on. */
export function importErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ModuleDisabledError) return NextResponse.json({ error: 'The Import Manager is turned off for this workspace.' }, { status: 403 });
  const message = error instanceof Error ? error.message : fallback;
  if (message === 'UNAUTHORIZED') return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  if (message === 'NO_WORKSPACE') return NextResponse.json({ error: 'No workspace is selected.' }, { status: 400 });
  if (message === 'FORBIDDEN') return NextResponse.json({ error: 'Only owners, admins and finance managers can import data.' }, { status: 403 });
  return NextResponse.json({ error: message }, { status: 400 });
}
