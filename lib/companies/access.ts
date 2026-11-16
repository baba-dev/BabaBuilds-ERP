import 'server-only';

import { prisma } from '@/lib/prisma';

/** Active members of a group, by user id. Anyone added to a company must already be one of them. */
export async function activeGroupMemberIds(groupId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.companyGroupMember.findMany({ where: { companyGroupId: groupId, isActive: true, userId: { in: userIds } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/** Number of active owners; used so the last owner can never be demoted, removed or locked out. */
export const countActiveOwners = (groupId: string, excludeMemberId?: string) =>
  prisma.companyGroupMember.count({ where: { companyGroupId: groupId, isActive: true, groupRole: 'GROUP_OWNER', ...(excludeMemberId ? { id: { not: excludeMemberId } } : {}) } });
