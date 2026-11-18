import 'server-only';
import { prisma } from '@/lib/prisma';
import type { UsagePolicy } from './usage-math';

export type EffectiveMailBillingSettings = {
  autoUpdateRetainerQuantities: boolean;
  ignoreAdminMailboxesFromBilling: boolean;
  syncFrequencyPreference: 'MANUAL' | 'DAILY' | 'WEEKLY';
  usageBillingPolicy: UsagePolicy;
  prorateIncreases: boolean;
  /** Master switch for changing anything on the mail servers from the ERP. */
  allowMailboxManagement: boolean;
  quotaAlertPercent: number;
  paymentDigest: 'OFF' | 'DAILY' | 'WEEKLY';
};

/** Settings for a workspace, with the documented defaults when it has never saved any. */
export async function loadMailBillingSettings(workspaceId: string): Promise<EffectiveMailBillingSettings> {
  const row = await prisma.mailBillingSettings.findUnique({ where: { workspaceId } });
  return {
    autoUpdateRetainerQuantities: row?.autoUpdateRetainerQuantities ?? false,
    ignoreAdminMailboxesFromBilling: row?.ignoreAdminMailboxesFromBilling ?? false,
    syncFrequencyPreference: (row?.syncFrequencyPreference as EffectiveMailBillingSettings['syncFrequencyPreference']) ?? 'MANUAL',
    usageBillingPolicy: row?.usageBillingPolicy === 'HIGH_WATER_MARK' ? 'HIGH_WATER_MARK' : 'LATEST',
    prorateIncreases: row?.prorateIncreases ?? true,
    allowMailboxManagement: row?.allowMailboxManagement ?? false,
    quotaAlertPercent: row?.quotaAlertPercent ?? 90,
    paymentDigest: row?.paymentDigest === 'OFF' || row?.paymentDigest === 'WEEKLY' ? row.paymentDigest : 'DAILY',
  };
}
