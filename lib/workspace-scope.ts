import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * Resolves the user's active workspace membership (same semantics as `/api/workspace/modules`).
 */
export async function getActiveWorkspaceIdForUser(userId: string): Promise<string | null> {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return wu?.workspaceId ?? null;
}
