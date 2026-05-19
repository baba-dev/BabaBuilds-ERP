import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { requirePermission } from '@/lib/rbac';

export default async function ReportingLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/reporting');

  const wu = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!wu?.workspaceId) redirect('/settings');

  const enabled = await isModuleEnabled(wu.workspaceId, 'REPORTING_CENTER');
  if (!enabled) redirect('/settings#workspace-modules');

  try {
    await requirePermission(session.user.id, wu.workspaceId, 'reporting_center.view');
  } catch {
    redirect('/dashboard');
  }

  return <>{children}</>;
}
