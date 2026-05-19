import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { hasTraversal, getFileContentType, logDeniedAssetAccess } from '@/lib/security/private-asset';
import { buildPrivatePath } from '@/lib/uploads/private-storage';
import { privateAssetPathSegments } from '@/lib/shop/public-assets';
import { promises as fs } from 'fs';

type StorefrontAssetRequest =
  | { kind: 'logo' }
  | { kind: 'product'; productId: string };

function parseStorefrontAsset(asset: string[]): StorefrontAssetRequest | null {
  if (asset.length === 1 && asset[0] === 'logo') return { kind: 'logo' };
  if (asset.length === 2 && asset[0] === 'product' && asset[1]) {
    return { kind: 'product', productId: asset[1] };
  }
  return null;
}

async function serveStorefrontImage(kind: 'logos' | 'products', pathSegments: string[]) {
  const filePath = buildPrivatePath(kind, pathSegments);
  try {
    const fileBuffer = await fs.readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': getFileContentType(filePath),
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code !== 'ENOENT') {
      console.error('Failed to read storefront asset', { kind, pathSegments, error: err });
    }
    return new NextResponse('Not Found', { status: 404 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ slug: string; asset: string[] }> }) {
  const { slug, asset } = await context.params;
  const requestedPath = asset.join('/');

  const parsed = parseStorefrontAsset(asset);

  if (hasTraversal(asset)) {
    logDeniedAssetAccess({
      kind: parsed?.kind === 'product' ? 'products' : 'logos',
      reason: 'path_traversal',
      request,
      requestedPath,
    });
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!parsed) return new NextResponse('Not Found', { status: 404 });

  const profile = await prisma.businessProfile.findUnique({
    where: { shopSlug: slug.toLowerCase() },
    select: {
      workspaceId: true,
      shopEnabled: true,
      logoUrl: true,
    },
  });

  if (!profile?.shopEnabled) return new NextResponse('Not Found', { status: 404 });

  const moduleEnabled = await isModuleEnabled(profile.workspaceId, 'SHOP');
  if (!moduleEnabled) return new NextResponse('Not Found', { status: 404 });

  if (parsed.kind === 'logo') {
    const segments = profile.logoUrl ? privateAssetPathSegments(profile.logoUrl, 'logos') : null;
    if (!segments || segments[0] !== profile.workspaceId) return new NextResponse('Not Found', { status: 404 });
    return serveStorefrontImage('logos', segments);
  }

  const product = await prisma.product.findFirst({
    where: {
      id: parsed.productId,
      workspaceId: profile.workspaceId,
      showInShop: true,
      currentStock: { gt: 0 },
    },
    select: {
      id: true,
      imageUrl: true,
      shopImageUrl: true,
    },
  });

  const selectedImageUrl = product?.shopImageUrl || product?.imageUrl || null;
  const segments = selectedImageUrl ? privateAssetPathSegments(selectedImageUrl, 'products') : null;
  if (!segments || segments[0] !== profile.workspaceId) return new NextResponse('Not Found', { status: 404 });

  return serveStorefrontImage('products', segments);
}
