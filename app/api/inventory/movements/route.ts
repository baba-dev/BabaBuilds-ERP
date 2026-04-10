import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 });
    }

    // Verify product belongs to workspace
    const product = await prisma.product.findUnique({
      where: { id: productId, workspaceId }
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: { productId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return NextResponse.json(movements);
  } catch (error: any) {
    console.error("[INVENTORY_MOVEMENTS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch movements" }, { status: 500 });
  }
}
