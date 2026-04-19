import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireModule } from '@/lib/modules';

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'FINANCE_MANAGER']);

export async function requireImportContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('UNAUTHORIZED');

  const membership = await prisma.workspaceUser.findFirst({
    where: { userId: session.user.id, isActive: true },
    orderBy: { joinedAt: 'asc' },
    select: { workspaceId: true, role: true, businessRole: true },
  });

  if (!membership?.workspaceId) throw new Error('NO_WORKSPACE');
  await requireModule(membership.workspaceId, 'IMPORT_MANAGER');

  const role = membership.businessRole ?? membership.role;
  if (!ALLOWED_ROLES.has(role)) throw new Error('FORBIDDEN');

  return { workspaceId: membership.workspaceId, userId: session.user.id, role };
}
