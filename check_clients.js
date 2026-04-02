const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.client.count();
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  console.log('Client count:', count);
  console.log('Clients:', JSON.stringify(clients, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
