import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';

export const metadata: Metadata = {
  title: 'AR Aging + Collections Centre · BabaBuilds ERP',
  robots: { index: false, follow: false },
};

async function getWorkspaceId(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
  });
  return wu?.workspaceId ?? null;
}

export default async function ArCollectionsLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/auth/signin');

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) redirect('/dashboard');

  const enabled = await isModuleEnabled(workspaceId, 'AR_COLLECTIONS');
  if (!enabled) redirect('/settings');

  return children;
}
