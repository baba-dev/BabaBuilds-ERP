import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const MULTI_COMPANY_MODULE_KEY = 'MULTI_COMPANY';

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`);
    this.name = 'WorkspaceNotFoundError';
  }
}

/**
 * Enables multi-company mode for an existing workspace by creating the company
 * group wrapper, linking the current workspace as the primary company, and
 * granting the actor owner-level access across the group.
 */
export async function enableMultiCompany(workspaceId: string, actorUserId: string) {
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
      throw new WorkspaceNotFoundError(workspaceId);
    }

    const existingPrimaryWorkspaceLink = await tx.companyGroupWorkspace.findFirst({
      where: { workspaceId: workspace.id, isPrimary: true },
      include: { companyGroup: true },
      orderBy: { createdAt: 'asc' },
    });

    const companyGroup = existingPrimaryWorkspaceLink?.companyGroup ?? await tx.companyGroup.create({
      data: {
        name: workspace.name,
        subscriptionStatus: workspace.subscriptionStatus,
        subscriptionEndsAt: workspace.subscriptionEndsAt,
        planTier: workspace.planTier,
        billingWorkspaceId: workspace.id,
      },
    });

    const primaryWorkspaceLink = existingPrimaryWorkspaceLink
      ? await tx.companyGroupWorkspace.update({
          where: { id: existingPrimaryWorkspaceLink.id },
          data: {
            relationType: 'PRIMARY',
            isPrimary: true,
            isActive: true,
          },
        })
      : await tx.companyGroupWorkspace.create({
          data: {
            companyGroupId: companyGroup.id,
            workspaceId: workspace.id,
            relationType: 'PRIMARY',
            isPrimary: true,
            isActive: true,
          },
        });

    const companyGroupMember = await tx.companyGroupMember.upsert({
      where: {
        companyGroupId_userId: {
          companyGroupId: companyGroup.id,
          userId: actorUserId,
        },
      },
      update: {
        groupRole: 'GROUP_OWNER',
        accessMode: 'ALL_COMPANIES',
        isActive: true,
      },
      create: {
        companyGroupId: companyGroup.id,
        userId: actorUserId,
        groupRole: 'GROUP_OWNER',
        accessMode: 'ALL_COMPANIES',
        isActive: true,
      },
    });

    const companyGroupModule = await tx.companyGroupModule.upsert({
      where: {
        companyGroupId_moduleKey: {
          companyGroupId: companyGroup.id,
          moduleKey: MULTI_COMPANY_MODULE_KEY,
        },
      },
      update: {
        isEnabled: true,
        disabledAt: null,
      },
      create: {
        companyGroupId: companyGroup.id,
        moduleKey: MULTI_COMPANY_MODULE_KEY,
        isEnabled: true,
        configJson: Prisma.JsonNull,
      },
    });

    const workspaceModule = await tx.workspaceModule.upsert({
      where: {
        workspaceId_moduleKey: {
          workspaceId: workspace.id,
          moduleKey: MULTI_COMPANY_MODULE_KEY,
        },
      },
      update: {
        isEnabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: actorUserId,
        disabledByUserId: null,
      },
      create: {
        workspaceId: workspace.id,
        moduleKey: MULTI_COMPANY_MODULE_KEY,
        isEnabled: true,
        enabledByUserId: actorUserId,
        configJson: Prisma.JsonNull,
      },
    });

    return {
      companyGroup,
      primaryWorkspaceLink,
      companyGroupMember,
      companyGroupModule,
      workspaceModule,
    };
  });
}
