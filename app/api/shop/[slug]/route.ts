import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { supplierChargesGst } from '@/lib/msme/threshold';
import { readShopContent } from '@/lib/shop/content';
import { publicStorefrontAssetUrl } from '@/lib/shop/public-assets';

/**
 * GET /api/shop/[slug]
 * Public endpoint — no auth required.
 * Returns workspace branding + sellable products for the public storefront.
 *
 * Returns 404 if either the per-workspace `shopEnabled` toggle is off OR the
 * SHOP optional module has been explicitly disabled by an admin.
 */
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;

    const profile = await prisma.businessProfile.findUnique({
      where: { shopSlug: slug.toLowerCase() },
      include: {
        workspace: {
          include: {
            products: {
              where: { currentStock: { gt: 0 }, showInShop: true, archivedAt: null },
              orderBy: [{ shopSortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    });

    if (!profile || !profile.shopEnabled) {
      return NextResponse.json({ error: 'Shop not found or not active' }, { status: 404 });
    }

    const moduleEnabled = await isModuleEnabled(profile.workspaceId, 'SHOP');
    if (!moduleEnabled) {
      return NextResponse.json({ error: 'Shop not found or not active' }, { status: 404 });
    }

    // Determine checkout capability (Razorpay or Stripe configured?)
    const hasRazorpay = !!(profile.razorpayKeyId && profile.razorpayKeySecret);
    const hasStripe   = !!(profile.stripePublishableKey && profile.stripeSecretKey);
    const activeGateway = hasRazorpay && profile.defaultGateway !== 'STRIPE'
      ? 'RAZORPAY'
      : hasStripe ? 'STRIPE' : null;

    const content = readShopContent(profile);

    return NextResponse.json({
      shop: {
        slug,
        companyName:    profile.companyName,
        tagline:        profile.shopTagline  || null,
        logoUrl:        publicStorefrontAssetUrl({ slug, url: profile.logoUrl, kind: 'logo' }),
        accentColor:    profile.shopAccentColor || '#6366f1',
        email:          profile.email,
        phone:          profile.phone        || null,
        website:        profile.website      || null,
        address:        profile.address,
      },
      content,
      currency: (profile.workspace.baseCurrency || 'INR').toUpperCase(),
      chargesGst: supplierChargesGst(profile, profile.workspace.countryCode || 'IN'),
      checkout: {
        available:      !!activeGateway,
        gateway:        activeGateway,        // 'RAZORPAY' | 'STRIPE' | null
        razorpayKeyId:  activeGateway === 'RAZORPAY' ? profile.razorpayKeyId : null,
        stripePublishableKey: activeGateway === 'STRIPE' ? profile.stripePublishableKey : null,
      },
      products: profile.workspace.products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.shopDescription || product.description,
        category: product.category,
        imageUrl: publicStorefrontAssetUrl({
          slug,
          url: product.shopImageUrl || product.imageUrl,
          kind: 'product',
          productId: product.id,
        }),
        price: Number(product.baselinePrice),
        taxRate: product.gstRate ?? 0,
        currentStock: product.currentStock,
      })),
    });
  } catch (error) {
    console.error('Shop GET error:', error);
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 });
  }
}
