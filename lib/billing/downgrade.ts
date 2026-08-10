import 'server-only';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';

export async function downgradeWorkspaceToFree(
  workspaceId: string,
  reason: 'subscription_expired' | 'trial_expired' | 'provider_cancelled',
): Promise<boolean> {
  const result = await prisma.workspace.updateMany({
    where: {
      id: workspaceId,
      OR: [
        { subscriptionStatus: { in: ['PRO', 'TEAM', 'TRIALING'] } },
        { planTier: { in: ['PRO', 'TEAM'] } },
      ],
    },
    data: {
      subscriptionStatus: 'FREE',
      planTier: 'FREE',
      planInterval: null,
      subscriptionCancelAtPeriodEnd: false,
      subscriptionCancellationLastError: null,
    },
  });

  if (result.count > 0) {
    await logActivity({
      action: 'billing.workspace_downgraded_to_free',
      status: 'SUCCESS',
      workspaceId,
      entity: { type: 'workspace_subscription' },
      metadata: {
        reason,
        premiumModulesAccessible: false,
        paymentGatewaySettingsAccessible: false,
      },
    });
  }

  return result.count > 0;
}
