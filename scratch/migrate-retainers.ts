import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting retainer migration...');

  // Find all retainers that have legacy fields but no items
  const legacyRetainers = await prisma.retainer.findMany({
    where: {
      items: {
        none: {}
      },
      OR: [
        { amount: { not: null } },
        { sacCode: { not: null } },
        { serviceName: { not: null } }
      ]
    }
  });

  console.log(`Found ${legacyRetainers.length} legacy retainers to migrate.`);

  let migratedCount = 0;

  for (const retainer of legacyRetainers) {
    if (retainer.amount !== null && retainer.serviceName !== null) {
      await prisma.retainerItem.create({
        data: {
          retainerId: retainer.id,
          title: retainer.serviceName,
          quantity: 1,
          unitPrice: retainer.amount,
          sacCode: retainer.sacCode,
          taxRate: 0, // Default or infer from legacy
        }
      });
      console.log(`Migrated retainer ${retainer.id} (Service: ${retainer.serviceName})`);
      migratedCount++;
    } else {
      console.warn(`Retainer ${retainer.id} has incomplete legacy data, skipping.`);
    }
  }

  console.log(`Migration complete. Successfully migrated ${migratedCount} retainers.`);
}

main()
  .catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
