import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { isModuleEnabled } from '@/lib/modules';
import { checkPermissionSilent } from '@/lib/rbac';
import { getActiveWorkspaceIdForUser } from '@/lib/workspace-scope';

export const metadata: Metadata = {
  title: 'AR Aging + Collections Centre · BabaBuilds ERP',
  robots: { index: false, follow: false },
};

export default async function ArCollectionsLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/ar-collections');

  const workspaceId = await getActiveWorkspaceIdForUser(session.user.id);
  if (!workspaceId) redirect('/dashboard');

  const [enabled, canView] = await Promise.all([
    isModuleEnabled(workspaceId, 'AR_COLLECTIONS'),
    checkPermissionSilent(session.user.id, workspaceId, 'invoices.view'),
  ]);

  if (!enabled || !canView) {
    redirect('/settings#workspace-modules');
  }

  return children;
}
