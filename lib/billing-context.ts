import 'server-only';

import { prisma } from '@/lib/prisma';

export type GroupBillingContext = {
  billingScope: 'GROUP';
  groupId: string;
  planTier: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
};

export type WorkspaceBillingContext = {
  billingScope: 'WORKSPACE';
  workspaceId: string;
  planTier: string;
  subscriptionStatus: string;
  subscriptionEndsAt: Date | null;
};

export type BillingContext = GroupBillingContext | WorkspaceBillingContext;

/**
 * Resolve the billing owner for a workspace.
 *
 * Company groups can centralize subscription limits and feature unlocks across
 * multiple workspaces. When a workspace is linked to an active group, use the
 * group's billing fields; otherwise fall back to the workspace's own billing
 * fields. Keep downstream invoice, client, seat, module, gateway, and storage
 * checks wired through this resolver so group billing remains consistent.
 */
export async function loadBillingContext(workspaceId: string): Promise<BillingContext> {
  const groupLink = await prisma.companyGroupWorkspace.findFirst({
    where: {
      workspaceId,
      isActive: true,
    },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'asc' },
    ],
    select: {
      companyGroup: {
        select: {
          id: true,
          planTier: true,
          subscriptionStatus: true,
          subscriptionEndsAt: true,
        },
      },
    },
  });

  if (groupLink) {
    return {
      billingScope: 'GROUP',
      groupId: groupLink.companyGroup.id,
      planTier: groupLink.companyGroup.planTier,
      subscriptionStatus: groupLink.companyGroup.subscriptionStatus,
      subscriptionEndsAt: groupLink.companyGroup.subscriptionEndsAt,
    };
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      planTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
    },
  });

  if (!workspace) {
    throw new Error(`Workspace not found while loading billing context: ${workspaceId}`);
  }

  return {
    billingScope: 'WORKSPACE',
    workspaceId: workspace.id,
    planTier: workspace.planTier,
    subscriptionStatus: workspace.subscriptionStatus,
    subscriptionEndsAt: workspace.subscriptionEndsAt,
  };
}
