import { NextResponse } from "next/server";
import { parseProductGst } from "@/lib/gst/source";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const cursor = searchParams.get('cursor');
    const q = (searchParams.get('q') || '').trim();

    const products = await prisma.product.findMany({
      where: q
        ? {
            workspaceId,
            OR: [
              { name: { contains: q } },
              { sku: { contains: q } },
              { barcode: { contains: q } },
            ],
          }
        : { workspaceId },
      take: limit,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy: { currentStock: 'asc' } // Show low stock first
    });

    return NextResponse.json(products, {
      headers: {
        "X-Next-Cursor": products.length > 0 ? String(products[products.length - 1].id) : "",
      },
    });
  } catch (error: unknown) {
    console.error("[INVENTORY_PRODUCTS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { scanBuffer } from '@/lib/security/clamav';
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from '@/lib/uploads/private-storage';
import { getErrorCode } from "@/lib/error-utils";

function isAllowedProductImageExtension(ext: string) {
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase());
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
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
    const gst = parseProductGst(formData.get('hsnCode'), formData.get('gstRate'));
    if (!gst.ok) return NextResponse.json({ error: gst.message, code: gst.code }, { status: 422 });

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

      const sniffed = sniffAllowedContent(buffer);
      if (!sniffed || (sniffed !== 'png' && sniffed !== 'jpeg' && sniffed !== 'webp')) {
        return NextResponse.json({ error: "Unsupported or unsafe image content." }, { status: 415 });
      }
      if (sniffed === 'jpeg' && ext !== '.jpg' && ext !== '.jpeg') {
        return NextResponse.json({ error: "Image content did not match expected JPEG type." }, { status: 415 });
      }

      const dir = buildPrivatePath('products', [workspaceId]);
      await ensureDir(dir);
      const storedName = uniqueStoredName(`product-${uuidv4()}`, ext);
      const filepath = path.join(dir, storedName);
      fs.writeFileSync(filepath, buffer, { mode: 0o600 });
      imageUrl = `/products/${workspaceId}/${storedName}`;
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
        hsnCode: gst.hsnCode,
        gstRate: gst.gstRate,
        currentStock,
        safetyStock,
        status,
        barcode: barcode || null,
        location: location || null,
        imageUrl,
      }
    });

    // Record the initial stock entry as an inventory movement for full audit trail.
    if (currentStock > 0) {
      await prisma.inventoryMovement.create({
        data: {
          workspaceId,
          productId: newProduct.id,
          type: "IN",
          quantity: currentStock,
          reason: "Initial Stock Entry",
        },
      });
    }

    // New products affect operations.lowStockCount on the dashboard.
    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (err) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'product', action: 'create', error: String(err) });
    }

    return NextResponse.json({ success: true, product: newProduct });
  } catch (error: unknown) {
    if (getErrorCode(error) === 'P2002') {
      return NextResponse.json({ error: "A product with this SKU already exists" }, { status: 409 });
    }
    console.error("[INVENTORY_PRODUCTS_POST]", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}
