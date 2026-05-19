import 'server-only';

import { prisma } from '@/lib/prisma';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getWorkspaceDocumentStorageCapBytes } from '@/lib/documents/policy';
import { resolveEffectivePlanTier } from '@/lib/entitlements';

export type WorkspaceQuotaSnapshot = {
  bytesUsedTotal: number;
  bytesCapTotal: number;
  percentUsed: number; // 0..1 (Infinity cap -> 0)
  warningLevel: 'OK' | 'WARN_70' | 'WARN_90' | 'FULL';
};

function coerceNumber(n: unknown): number {
  if (typeof n === 'bigint') return Number(n);
  if (typeof n === 'number') return n;
  return Number(n ?? 0);
}

export async function getWorkspaceQuotaSnapshot(workspaceId: string): Promise<WorkspaceQuotaSnapshot> {
  const [workspace, storage] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        planTier: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        signupIntentJson: true,
      },
    }),
    prisma.workspaceDocumentStorage.findUnique({
      where: { workspaceId },
      select: { bytesUsedTotal: true },
    }),
  ]);

  const effectiveTier = workspace ? resolveEffectivePlanTier(workspace) : 'FREE';
  const cap = getWorkspaceDocumentStorageCapBytes(effectiveTier);
  const used = coerceNumber(storage?.bytesUsedTotal ?? 0);
  const percentUsed = cap === Infinity ? 0 : cap <= 0 ? 1 : Math.min(1, used / cap);

  const warningLevel: WorkspaceQuotaSnapshot['warningLevel'] =
    cap !== Infinity && used >= cap
      ? 'FULL'
      : percentUsed >= 0.9
        ? 'WARN_90'
        : percentUsed >= 0.7
          ? 'WARN_70'
          : 'OK';

  return {
    bytesUsedTotal: used,
    bytesCapTotal: cap,
    percentUsed,
    warningLevel,
  };
}

export async function canWorkspaceUploadBytes(params: {
  workspaceId: string;
  incomingBytes: number;
}): Promise<
  | { ok: true; snapshot: WorkspaceQuotaSnapshot }
  | { ok: false; snapshot: WorkspaceQuotaSnapshot; errorCode: 'DOCS_QUOTA_EXCEEDED' }
> {
  const snapshot = await getWorkspaceQuotaSnapshot(params.workspaceId);
  if (snapshot.bytesCapTotal === Infinity) return { ok: true, snapshot };

  const nextUsed = snapshot.bytesUsedTotal + Math.max(0, params.incomingBytes);
  if (nextUsed > snapshot.bytesCapTotal) {
    return { ok: false, snapshot, errorCode: 'DOCS_QUOTA_EXCEEDED' };
  }
  return { ok: true, snapshot };
}

type TxLike = Prisma.TransactionClient | PrismaClient;

export async function consumeWorkspaceDocumentBytes(
  tx: TxLike,
  params: { workspaceId: string; addBytes: number; addActiveBytes?: number },
) {
  const addBytes = Math.max(0, Number(params.addBytes || 0));
  const addActiveBytes = Math.max(0, Number(params.addActiveBytes ?? params.addBytes ?? 0));

  await tx.workspaceDocumentStorage.upsert({
    where: { workspaceId: params.workspaceId },
    create: {
      workspaceId: params.workspaceId,
      bytesUsedTotal: addBytes,
      bytesUsedActive: addActiveBytes,
    },
    update: {
      bytesUsedTotal: { increment: addBytes },
      bytesUsedActive: { increment: addActiveBytes },
    },
  });
}

