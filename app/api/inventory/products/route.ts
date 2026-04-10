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
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const cursor = searchParams.get('cursor');

    const products = await prisma.product.findMany({
      where: { workspaceId },
      take: limit,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy: { currentStock: 'asc' } // Show low stock first
    });

    return NextResponse.json(products);
  } catch (error: any) {
    console.error("[INVENTORY_PRODUCTS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
