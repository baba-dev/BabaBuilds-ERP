import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirectToLogin } from '@/lib/auth/login-redirect';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';

export default async function TaxAdvancedLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirectToLogin('/tax/advanced');

  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true },
  });

  if (!membership?.workspaceId) redirect('/settings');

  const enabled = await isModuleEnabled(membership.workspaceId, 'TAX_ADVANCED');
  if (!enabled) redirect('/tax');

  return <>{children}</>;
}
