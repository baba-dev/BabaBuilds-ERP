import { prisma } from './lib/prisma';

async function fix() {
  try {
    const res = await prisma.$executeRaw`UPDATE "Invoice" SET "status" = UPPER("status") WHERE "status" IN ('Pending', 'Paid', 'PartiallyPaid', 'Partially Paid')`;
    console.log("Updated rows:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}
fix();
