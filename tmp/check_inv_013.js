const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { 
      invoiceNumber: 'INV/25-26/013',
      workspaceId: 'cmnhhyotm0001uieu0d1bohct'
    }
  });
  console.log(JSON.stringify(inv, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
