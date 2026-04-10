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

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';

function isAllowedProductImageExtension(ext: string) {
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase());
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as any)?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const sku = formData.get('sku') as string;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const unit = formData.get('unit') as string || 'pcs';
    const baselinePrice = Number(formData.get('baselinePrice')) || 0;
    const costPrice = Number(formData.get('costPrice')) || 0;
    const currentStock = Number(formData.get('currentStock')) || 0;
    const safetyStock = Number(formData.get('safetyStock')) || 5;
    const barcode = formData.get('barcode') as string;
    const location = formData.get('location') as string;

    if (!sku || !name) {
      return NextResponse.json({ error: "SKU and Name are required" }, { status: 400 });
    }

    const file = formData.get('image') as File | null;
    let imageUrl = null;

    if (file && file.size > 0) {
      const ext = path.extname(file.name).toLowerCase();
      if (!isAllowedProductImageExtension(ext)) {
        return NextResponse.json({ error: "Invalid image format. Allowed: JPG, PNG, WEBP" }, { status: 400 });
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const isSafe = await scanBuffer(buffer);
      if (!isSafe) {
        return NextResponse.json({ error: "Malware detected in uploaded file." }, { status: 400 });
      }

      const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'products', workspaceId); 
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `product-${Date.now()}-${uuidv4()}${ext}`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buffer);
      imageUrl = `/products/${workspaceId}/${filename}`;
    }

    const status = currentStock === 0 ? "OUT_OF_STOCK" : (currentStock <= safetyStock ? "LOW_STOCK" : "IN_STOCK");

    const newProduct = await prisma.product.create({
      data: {
        workspaceId,
        sku,
        name,
        description: description || null,
        category: category || null,
        unit,
        baselinePrice,
        costPrice,
        currentStock,
        safetyStock,
        status,
        barcode: barcode || null,
        location: location || null,
        imageUrl,
      }
    });

    if (currentStock > 0) {
      await prisma.inventoryMovement.create({
        data: {
          workspaceId,
          productId: newProduct.id,
          type: "IN",
          quantity: currentStock,
          reason: "Initial Stock Entry"
        }
      });
    }

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
    console.error("[INVENTORY_PRODUCTS_POST]", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
