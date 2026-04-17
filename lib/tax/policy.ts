import type { PrismaClient } from '@prisma/client';

export type TaxJurisdictionContext = {
  workspaceCountryCode: string;
  baseCurrency: string;
};

export async function resolveTaxJurisdictionForWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
): Promise<TaxJurisdictionContext> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { countryCode: true, baseCurrency: true },
  });
  return {
    workspaceCountryCode: (ws?.countryCode ?? 'IN').trim().toUpperCase() || 'IN',
    baseCurrency: (ws?.baseCurrency ?? 'INR').trim() || 'INR',
  };
}
