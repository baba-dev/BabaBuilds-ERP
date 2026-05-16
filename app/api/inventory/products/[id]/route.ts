import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';
import path from 'path';
import { scanBuffer } from '@/lib/security/clamav';
import { buildPrivatePath, ensureDir, sniffAllowedContent, uniqueStoredName } from '@/lib/uploads/private-storage';
import fs from 'fs';
import { assertFreeTierPublishedShopListingsAllowed } from '@/lib/entitlements';

function isAllowedProductImageExtension(ext: string) {
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase());
}

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;

    const product = await prisma.product.findFirst({
      where: { id, workspaceId },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });

    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    return NextResponse.json(product);
  } catch (error) {
    console.error("[INVENTORY_PRODUCT_GET]", error);
    return NextResponse.json({ error: "Failed to fetch product" }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    
    // Check product exists
    const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const formData = await req.formData();
    
    // Parse fields
    const sku = formData.get('sku') as string;
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const category = formData.get('category') as string;
    const unit = formData.get('unit') as string;
    const baselinePrice = formData.has('baselinePrice') ? Number(formData.get('baselinePrice')) : undefined;
    const costPrice = formData.has('costPrice') ? Number(formData.get('costPrice')) : undefined;
    const safetyStock = formData.has('safetyStock') ? Number(formData.get('safetyStock')) : undefined;
    const barcode = formData.get('barcode') as string;
    const location = formData.get('location') as string;

    const dataToUpdate: Record<string, unknown> = {};
    if (sku !== null) dataToUpdate.sku = sku;
    if (name !== null) dataToUpdate.name = name;
    if (description !== null) dataToUpdate.description = description;
    if (category !== null) dataToUpdate.category = category;
    if (unit !== null) dataToUpdate.unit = unit;
    if (baselinePrice !== undefined) dataToUpdate.baselinePrice = baselinePrice;
    if (costPrice !== undefined) dataToUpdate.costPrice = costPrice;
    if (safetyStock !== undefined) {
      dataToUpdate.safetyStock = safetyStock;
      dataToUpdate.status = existing.currentStock === 0 ? "OUT_OF_STOCK" : (existing.currentStock <= safetyStock ? "LOW_STOCK" : "IN_STOCK");
    }
    if (barcode !== null) dataToUpdate.barcode = barcode;
    if (location !== null) dataToUpdate.location = location;

    const showInShopRaw = formData.get("showInShop");
    if (showInShopRaw !== null) {
      const enablingShop = showInShopRaw === "true" || showInShopRaw === "1";
      if (enablingShop && !existing.showInShop) {
        const denied = await assertFreeTierPublishedShopListingsAllowed(workspaceId);
        if (denied) {
          return NextResponse.json(
            { error: denied.message, code: denied.code, requiresUpgrade: true },
            { status: 403 },
          );
        }
      }
      dataToUpdate.showInShop = enablingShop;
    }

    // Handle Image Upload
    const file = formData.get('image') as File | null;
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
      if (sniffed === 'jpeg' && (ext !== '.jpg' && ext !== '.jpeg')) {
        return NextResponse.json({ error: "Image content did not match expected JPEG type." }, { status: 415 });
      }
      if (sniffed === 'png' && ext !== '.png') {
        return NextResponse.json({ error: "Image content did not match expected PNG type." }, { status: 415 });
      }
      if (sniffed === 'webp' && ext !== '.webp') {
        return NextResponse.json({ error: "Image content did not match expected WEBP type." }, { status: 415 });
      }

      const dir = buildPrivatePath('products', [workspaceId]);
      await ensureDir(dir);

      const filename = uniqueStoredName('product', ext);
      const filepath = path.join(dir, filename);
      await fs.promises.writeFile(filepath, buffer, { mode: 0o600 });

      dataToUpdate.imageUrl = `/products/${workspaceId}/${filename}`;

      // Cleanup old image if exists (best effort)
      if (existing.imageUrl?.startsWith('/products/')) {
        const oldName = existing.imageUrl.split('/').pop();
        if (oldName) {
          const oldFile = buildPrivatePath('products', [workspaceId, oldName]);
          try {
            await fs.promises.unlink(oldFile);
          } catch {
            // ignore
          }
        }
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: dataToUpdate
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_product', action: 'update', error: String(error) });
    }

    return NextResponse.json({ success: true, product: updated });
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: "SKU already exists" }, { status: 409 });
    }
    console.error("[INVENTORY_PRODUCT_PUT]", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;

    const existing = await prisma.product.findFirst({ where: { id, workspaceId } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    if (existing.imageUrl) {
      const oldFile = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', existing.imageUrl);
      if (fs.existsSync(oldFile)) {
        try { fs.unlinkSync(oldFile) } catch { /* Ignore cleanup errors */ }
      }
    }

    await prisma.product.delete({ where: { id } });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'inventory_product', action: 'delete', error: String(error) });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[INVENTORY_PRODUCT_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete product. Ensure it's not tied to invoices." }, { status: 500 });
  }
}
