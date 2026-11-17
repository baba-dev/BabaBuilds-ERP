/**
 * One-time: map legacy ENTERPRISE workspaces to TEAM (product tier removed).
 * Run: npx ts-node scripts/backfill-enterprise-tier.ts
 */
import { createPrismaClient } from '../lib/prisma-client';

const prisma = createPrismaClient();

async function main() {
  const res = await prisma.workspace.updateMany({
    where: { planTier: "ENTERPRISE" },
    data: {
      planTier: "TEAM",
      subscriptionStatus: "TEAM",
    },
  });
  console.log(`Updated ${res.count} workspace(s) from ENTERPRISE to TEAM.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
