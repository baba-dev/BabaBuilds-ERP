import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { withPermission } from '@/lib/rbac';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId || !session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const permission = await withPermission(userId, workspaceId, 'pos.view');
    if (!permission.granted) return permission.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'SERVICES'; // 'SERVICES' or 'PRODUCTS'

    if (type === 'SERVICES') {
      const services = await prisma.serviceTemplate.findMany({
        where: { workspaceId },
        select: { id: true, name: true, defaultPrice: true, description: true, sacCode: { select: { code: true, igstRate: true } } }
      });
      return NextResponse.json(services.map(s => ({
        id: s.id,
        type: 'SERVICE',
        name: s.name,
        price: Number(s.defaultPrice),
        description: s.description,
        taxRate: s.sacCode?.igstRate ?? 0
      })));
    } else {
      const products = await prisma.product.findMany({
        where: { workspaceId },
        select: { id: true, name: true, baselinePrice: true, description: true, currentStock: true }
      });
      return NextResponse.json(products.map(p => ({
        id: p.id,
        type: 'PRODUCT',
        name: p.name,
        price: Number(p.baselinePrice),
        description: p.description,
        stock: p.currentStock,
        taxRate: 0 // Products might have tax logic, default 0 for now
      })));
    }
  } catch (error) {
    console.error("POS Catalog Fetch Error:", error);
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  }
}
