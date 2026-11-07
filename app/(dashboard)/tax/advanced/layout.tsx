import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { prisma } from '@/lib/prisma';
import { getModuleAvailability } from '@/lib/modules';
import { ModuleUnavailable } from '@/components/modules/ModuleUnavailable';

export default async function TaxAdvancedLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/tax/advanced');

  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!membership?.workspaceId) redirect('/settings');

  const availability = await getModuleAvailability(membership.workspaceId, 'TAX_ADVANCED');
  if (availability !== 'enabled') {
    return <ModuleUnavailable moduleKey="TAX_ADVANCED" reason={availability} />;
  }

  return <>{children}</>;
}
