process.env.NEXT_RUNTIME = 'nodejs';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const workspaceId = (await prisma.workspace.findFirst())?.id;
    if (!workspaceId) throw new Error("No workspace");

    console.log("Testing groupBy with relation...");
    const res = await prisma.shopOrderItem.groupBy({
      where: {
        shopOrder: {
          workspaceId,
        },
      },
      by: ["productId", "productName"],
      _count: { _all: true },
      _sum: { lineTotal: true },
    });
    console.log("Success:", res.length);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
