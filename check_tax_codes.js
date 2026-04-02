const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const nicCount = await prisma.nICCode.count();
  const sacCount = await prisma.sACCode.count();
  console.log('NICCode count:', nicCount);
  console.log('SACCode count:', sacCount);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
