import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const poId = id;

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: poId, workspaceId },
      include: { items: true }
    });

    if (!po) {
      return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
    }

    if (po.status === "DELIVERED") {
      return NextResponse.json({ error: "Purchase Order is already delivered" }, { status: 400 });
    }

    const body = await req.json();
    const { syncExpense } = body; // Boolean flag from UI to log expense

    const transactionTasks: any[] = [];

    // 1. Update PO Status
    transactionTasks.push(
      prisma.purchaseOrder.update({
        where: { id: poId },
        data: { status: "DELIVERED" }
      })
    );

    // 2. Add Stock and Movement for each item
    for (const item of po.items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const newStock = product.currentStock + item.quantity;
        transactionTasks.push(
          prisma.product.update({
            where: { id: item.productId },
            data: {
              currentStock: newStock,
              status: newStock === 0 ? "OUT_OF_STOCK" : (newStock <= product.safetyStock ? "LOW_STOCK" : "IN_STOCK")
            }
          })
        );
        transactionTasks.push(
          prisma.inventoryMovement.create({
            data: {
              workspaceId,
              productId: item.productId,
              type: "IN",
              quantity: item.quantity,
              reason: `PO #${po.poNumber} Received`,
              referenceId: po.id
            }
          })
        );
      }
    }

    // 3. Sync Expense if requested
    if (syncExpense) {
      transactionTasks.push(
        prisma.expense.create({
          data: {
            workspaceId,
            vendor: po.supplier,
            amount: po.totalAmount,
            category: "Inventory Restock",
            description: `Auto-generated expense for PO #${po.poNumber}`,
            date: new Date()
          }
        })
      );
    }

    await prisma.$transaction(transactionTasks);

    return NextResponse.json({ success: true, message: `PO #${po.poNumber} Received Successfully` });
  } catch (error: any) {
    console.error("[PO_RECEIVE]", error);
    return NextResponse.json({ error: "Failed to receive Purchase Order" }, { status: 500 });
  }
}
