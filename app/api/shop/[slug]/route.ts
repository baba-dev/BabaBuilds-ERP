import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/shop/[slug]
 * Public endpoint — no auth required.
 * Returns workspace branding + shop-enabled services for the public storefront.
 */
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;

    const profile = await prisma.businessProfile.findUnique({
      where: { shopSlug: slug.toLowerCase() },
      include: {
        workspace: {
          include: {
            serviceTemplates: {
              where: { showInShop: true },
              include: { sacCode: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });

    if (!profile || !profile.shopEnabled) {
      return NextResponse.json({ error: 'Shop not found or not active' }, { status: 404 });
    }

    // Determine checkout capability (Razorpay or Stripe configured?)
    const hasRazorpay = !!(profile.razorpayKeyId && profile.razorpayKeySecret);
    const hasStripe   = !!(profile.stripePublishableKey && (profile as any).stripeSecretKey);
    const activeGateway = hasRazorpay && profile.defaultGateway !== 'STRIPE'
      ? 'RAZORPAY'
      : hasStripe ? 'STRIPE' : null;

    return NextResponse.json({
      shop: {
        slug,
        companyName:    profile.companyName,
        tagline:        profile.shopTagline  || null,
        logoUrl:        profile.logoUrl      || null,
        accentColor:    profile.shopAccentColor || '#6366f1',
        email:          profile.email,
        phone:          profile.phone        || null,
        website:        profile.website      || null,
        address:        profile.address,
      },
      checkout: {
        available:      !!activeGateway,
        gateway:        activeGateway,        // 'RAZORPAY' | 'STRIPE' | null
        razorpayKeyId:  activeGateway === 'RAZORPAY' ? profile.razorpayKeyId : null,
        stripePublishableKey: activeGateway === 'STRIPE' ? profile.stripePublishableKey : null,
      },
      services: profile.workspace.serviceTemplates.map((s) => ({
        id:             s.id,
        name:           s.name,
        description:    s.description,
        longDescription: s.longDescription,
        imageUrl:       s.imageUrl,
        price:          Number(s.defaultPrice),
        sacCode:        s.sacCode?.code || null,
        taxRate:        s.sacCode?.igstRate || 0,
      })),
    });
  } catch (error) {
    console.error('Shop GET error:', error);
    return NextResponse.json({ error: 'Failed to load shop' }, { status: 500 });
  }
}
