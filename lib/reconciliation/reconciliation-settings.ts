import { prisma } from "@/lib/prisma";

export type ReconciliationSettingsDTO = {
  autoMatchMinScore: number;
  autoMatchSuggestionMin: number;
  importRawRetentionDays: number;
  storeRawImportBytes: boolean;
  bankFeedProvider: string;
};

const DEFAULTS: ReconciliationSettingsDTO = {
  autoMatchMinScore: 95,
  autoMatchSuggestionMin: 70,
  importRawRetentionDays: 0,
  storeRawImportBytes: false,
  bankFeedProvider: "NONE",
};

export async function getOrCreateReconciliationSettings(
  workspaceId: string,
): Promise<ReconciliationSettingsDTO> {
  const row = await prisma.workspaceReconciliationSettings.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      autoMatchMinScore: DEFAULTS.autoMatchMinScore,
      autoMatchSuggestionMin: DEFAULTS.autoMatchSuggestionMin,
      importRawRetentionDays: DEFAULTS.importRawRetentionDays,
      storeRawImportBytes: DEFAULTS.storeRawImportBytes,
      bankFeedProvider: DEFAULTS.bankFeedProvider,
    },
    update: {},
  });
  return {
    autoMatchMinScore: row.autoMatchMinScore,
    autoMatchSuggestionMin: row.autoMatchSuggestionMin,
    importRawRetentionDays: row.importRawRetentionDays,
    storeRawImportBytes: row.storeRawImportBytes,
    bankFeedProvider: row.bankFeedProvider,
  };
}
