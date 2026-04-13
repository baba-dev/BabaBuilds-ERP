import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, quantity, reason } = body;

    if (!productId || quantity === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify product exists and belongs to workspace
    const product = await prisma.product.findUnique({
      where: { id: productId, workspaceId }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const newStock = product.currentStock + quantity;
    if (newStock < 0) {
      return NextResponse.json({ error: "Insufficient stock for this deduction" }, { status: 400 });
    }

    // Perform transaction to ensure data integrity
    const [updatedProduct, movement] = await prisma.$transaction([
      prisma.product.update({
        where: { id: productId },
        data: {
          currentStock: newStock,
          status: newStock === 0 ? "OUT_OF_STOCK" : (newStock <= product.safetyStock ? "LOW_STOCK" : "IN_STOCK")
        }
      }),
      prisma.inventoryMovement.create({
        data: {
          workspaceId,
          productId,
          type: "ADJ",
          quantity,
          reason: reason || "Manual Adjustment"
        }
      })
    ]);

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_adjustment', action: 'create', error: String(error) });
    }

    return NextResponse.json({ product: updatedProduct, movement });
  } catch (error: any) {
    console.error("[INVENTORY_ADJUST_POST]", error);
    return NextResponse.json({ error: "Failed to adjust stock" }, { status: 500 });
  }
}
