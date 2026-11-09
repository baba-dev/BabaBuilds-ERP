import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { getModuleAvailability } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { ModuleUnavailable } from '@/components/modules/ModuleUnavailable';

const ALLOWED = new Set(['OWNER', 'ADMIN', 'FINANCE_MANAGER']);

export default async function ImportManagerLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/import-manager');

  const membership = await resolveSessionMembership(session);
  if (!membership?.workspaceId) redirect('/settings');

  const role = membership.businessRole ?? membership.role;
  if (!ALLOWED.has(role)) redirect('/settings');

  const availability = await getModuleAvailability(membership.workspaceId, 'IMPORT_MANAGER');
  if (availability !== 'enabled') {
    return <ModuleUnavailable moduleKey="IMPORT_MANAGER" reason={availability} />;
  }

  return children;
}
