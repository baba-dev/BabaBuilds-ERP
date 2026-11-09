import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { getModuleAvailability } from '@/lib/modules';
import { requirePermission } from '@/lib/rbac';
import { ModuleUnavailable } from '@/components/modules/ModuleUnavailable';

export default async function ReportingLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/reporting');

  const wu = await resolveSessionMembership(session);

  if (!wu?.workspaceId) redirect('/settings');

  // Permission first: users who cannot view reporting are not told whether the module is on.
  try {
    await requirePermission(session.user.id, wu.workspaceId, 'reporting_center.view');
  } catch {
    redirect('/dashboard');
  }

  const availability = await getModuleAvailability(wu.workspaceId, 'REPORTING_CENTER');
  if (availability !== 'enabled') {
    return <ModuleUnavailable moduleKey="REPORTING_CENTER" reason={availability} />;
  }

  return <>{children}</>;
}
