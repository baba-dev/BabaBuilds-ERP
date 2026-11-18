import 'server-only';
import { prisma } from '@/lib/prisma';
import { syncMailBillingServer } from './sync';
import { captureUsageSnapshots } from './usage';
import { evaluateSubscriptionQuantity } from './quantity';
import { convertEndedTrials, type TrialConversionStats } from './lifecycle';
import { loadMailBillingSettings } from './settings';
import { syncQuotaAlerts } from './quota';
import { sendPaymentDigest } from './digest';

const HOUR_MS = 3_600_000;
/** A little under the nominal interval so a job that runs slightly early or late still syncs on schedule. */
const SYNC_DUE_AFTER_MS = { DAILY: 20 * HOUR_MS, WEEKLY: 6.5 * 24 * HOUR_MS } as const;

export type WorkspaceRunStats = {
  workspaceId: string;
  serversSynced: number;
  serversFailed: number;
  snapshots: number;
  quantityApplied: number;
  quantityQueuedForReview: number;
  trials: TrialConversionStats;
  quotaAlerts: number;
  digest: 'SENT' | 'SKIPPED';
  error?: string;
};

/**
 * The daily Email Hosting job for one workspace, in the order that makes billing correct:
 * refresh inventory (per the sync preference) -> record usage -> end trials -> apply or queue quantity changes.
 * Must run before the retainer job so that day's invoices use the latest quantities.
 */
export async function runEmailHostingDailyForWorkspace(workspaceId: string, now: Date): Promise<WorkspaceRunStats> {
  const stats: WorkspaceRunStats = {
    workspaceId, serversSynced: 0, serversFailed: 0, snapshots: 0, quantityApplied: 0, quantityQueuedForReview: 0,
    trials: { converted: 0, needsReview: 0, skipped: 0, failed: 0 }, quotaAlerts: 0, digest: 'SKIPPED',
  };
  const settings = await loadMailBillingSettings(workspaceId);

  if (settings.syncFrequencyPreference !== 'MANUAL') {
    const dueAfter = SYNC_DUE_AFTER_MS[settings.syncFrequencyPreference];
    const servers = await prisma.mailBillingServer.findMany({ where: { workspaceId, status: { not: 'DISABLED' } }, select: { id: true, lastSyncAt: true } });
    for (const server of servers) {
      if (server.lastSyncAt && now.getTime() - server.lastSyncAt.getTime() < dueAfter) continue;
      try {
        await syncMailBillingServer({ workspaceId, serverId: server.id });
        stats.serversSynced++;
      } catch {
        // The sync records its own failure (run, server status and a review item); the rest of the job still runs.
        stats.serversFailed++;
      }
    }
  }

  const readings = await captureUsageSnapshots({ workspaceId, now, source: 'CRON' });
  stats.snapshots = readings.length;
  stats.trials = await convertEndedTrials({ workspaceId, now });

  for (const reading of readings) {
    const decision = await evaluateSubscriptionQuantity({ workspaceId, subscriptionId: reading.subscriptionId, latest: reading.billableMailboxCount, now, settings });
    if (decision.action === 'APPLY') stats.quantityApplied++;
    else if (decision.action === 'REVIEW') stats.quantityQueuedForReview++;
  }

  // Alerts last, so they reflect the inventory just synced and the billing just applied.
  // A failure here must not discard the billing work above, so each is contained.
  stats.quotaAlerts = await syncQuotaAlerts(workspaceId, settings.quotaAlertPercent).catch((error) => { console.error('Quota alerts failed:', workspaceId, error); return 0; });
  stats.digest = await sendPaymentDigest(workspaceId, settings, now).catch((error) => { console.error('Payment digest failed:', workspaceId, error); return 'SKIPPED' as const; });
  return stats;
}

/** Runs the daily job for every workspace that has Email Hosting switched on; one workspace failing never stops the rest. */
export async function runEmailHostingDaily(now: Date, only?: { workspaceId: string }) {
  const modules = await prisma.workspaceModule.findMany({
    where: { moduleKey: 'MIAB_BILLING', isEnabled: true, ...(only ? { workspaceId: only.workspaceId } : {}) },
    select: { workspaceId: true },
  });
  const results: WorkspaceRunStats[] = [];
  for (const { workspaceId } of modules) {
    try {
      results.push(await runEmailHostingDailyForWorkspace(workspaceId, now));
    } catch (error) {
      console.error('Email hosting daily run failed for workspace:', workspaceId, error);
      results.push({
        workspaceId, serversSynced: 0, serversFailed: 0, snapshots: 0, quantityApplied: 0, quantityQueuedForReview: 0,
        trials: { converted: 0, needsReview: 0, skipped: 0, failed: 0 }, quotaAlerts: 0, digest: 'SKIPPED', error: 'FAILED',
      });
    }
  }
  return results;
}
