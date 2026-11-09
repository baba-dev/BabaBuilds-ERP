import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * The user's OLDEST active workspace. This is only a fallback for callers that have no session workspace; code that
 * has a session must use `resolveSessionMembership` so a user who switched workspace is not served another one.
 */
export async function getActiveWorkspaceIdForUser(userId: string): Promise<string | null> {
  const wu = await prisma.workspaceUser.findFirst({
    where: { userId, isActive: true },
    select: { workspaceId: true },
    orderBy: { joinedAt: 'asc' },
  });
  return wu?.workspaceId ?? null;
}

export type SessionMembership = { workspaceId: string; role: string; businessRole: string | null };

type SessionLike = { user?: { id?: string | null } | null; workspaceId?: string | null } | null | undefined;

/**
 * The membership the request is really for: the workspace in the session (the one the user switched to), checked against
 * a live active membership, and only if that is missing the oldest one. Module guards, report queries and imports must
 * all go through this so they act on the same workspace the user is looking at.
 */
export async function resolveSessionMembership(session: SessionLike): Promise<SessionMembership | null> {
  const userId = session?.user?.id;
  if (!userId) return null;
  const select = { workspaceId: true, role: true, businessRole: true } as const;
  if (session?.workspaceId) {
    const current = await prisma.workspaceUser.findFirst({ where: { userId, workspaceId: session.workspaceId, isActive: true }, select });
    if (current) return current;
  }
  return prisma.workspaceUser.findFirst({ where: { userId, isActive: true }, orderBy: { joinedAt: 'asc' }, select });
}
