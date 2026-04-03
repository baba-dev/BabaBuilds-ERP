const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const statuses = await prisma.invoice.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.log(JSON.stringify(statuses, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
