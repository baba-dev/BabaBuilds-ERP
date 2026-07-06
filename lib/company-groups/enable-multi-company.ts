import 'server-only';

import { prisma } from '@/lib/prisma';

const MULTI_COMPANY_MODULE_KEY = 'MULTI_COMPANY';
const GROUP_OWNER_ROLE = 'GROUP_OWNER';

export type EnableMultiCompanyInput = {
  workspaceId: string;
  actorUserId: string;
};

export async function enableMultiCompany({ workspaceId, actorUserId }: EnableMultiCompanyInput) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        planTier: true,
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found.');
    }

    const user = await tx.user.findUnique({
      where: { id: actorUserId },
      select: { id: true },
    });

    if (!user) {
      throw new Error('Actor not found.');
    }

    const existingLink = await tx.companyGroupWorkspace.findFirst({
      where: { workspaceId: workspace.id, isActive: true },
      select: { companyGroupId: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    if (existingLink) {
      const member = await tx.companyGroupMember.upsert({
        where: {
          companyGroupId_userId: {
            companyGroupId: existingLink.companyGroupId,
            userId: actorUserId,
          },
        },
        create: {
          companyGroupId: existingLink.companyGroupId,
          userId: actorUserId,
          role: GROUP_OWNER_ROLE,
          isActive: true,
        },
        update: { role: GROUP_OWNER_ROLE, isActive: true },
      });

      await tx.companyGroupModule.upsert({
        where: {
          companyGroupId_moduleKey: {
            companyGroupId: existingLink.companyGroupId,
            moduleKey: MULTI_COMPANY_MODULE_KEY,
          },
        },
        create: {
          companyGroupId: existingLink.companyGroupId,
          moduleKey: MULTI_COMPANY_MODULE_KEY,
          isEnabled: true,
        },
        update: { isEnabled: true, disabledAt: null },
      });

      return { companyGroupId: existingLink.companyGroupId, memberId: member.id };
    }

    const group = await tx.companyGroup.create({
      data: {
        name: `${workspace.name} Group`,
        subscriptionStatus: workspace.subscriptionStatus,
        subscriptionEndsAt: workspace.subscriptionEndsAt,
        planTier: workspace.planTier,
        billingWorkspaceId: workspace.id,
        workspaces: {
          create: {
            workspaceId: workspace.id,
            isPrimary: true,
            isActive: true,
          },
        },
        members: {
          create: {
            userId: actorUserId,
            role: GROUP_OWNER_ROLE,
            isActive: true,
            workspaceAccess: {
              create: {
                workspaceId: workspace.id,
                accessRole: GROUP_OWNER_ROLE,
                isActive: true,
              },
            },
          },
        },
        modules: {
          create: {
            moduleKey: MULTI_COMPANY_MODULE_KEY,
            isEnabled: true,
          },
        },
      },
      select: {
        id: true,
        members: { where: { userId: actorUserId }, select: { id: true }, take: 1 },
      },
    });

    return { companyGroupId: group.id, memberId: group.members[0]?.id ?? null };
  });
}
