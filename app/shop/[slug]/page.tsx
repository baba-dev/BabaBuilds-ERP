import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopClient } from "./ShopClient";

interface ShopData {
  shop: {
    slug: string; companyName: string; tagline: string | null; logoUrl: string | null;
    accentColor: string; email: string; phone: string | null; website: string | null; address: string;
  };
  checkout: {
    available: boolean; gateway: "RAZORPAY" | "STRIPE" | null;
    razorpayKeyId: string | null; stripePublishableKey: string | null;
  };
  services: {
    id: string; name: string; description: string | null; longDescription: string | null;
    imageUrl: string | null; price: number; sacCode: string | null; taxRate: number;
  }[];
}

const BASE_URL = "https://erp.bababuilds.com";
const SHOP_REVALIDATE_SECONDS = 60;
const FALLBACK_SOCIAL_IMAGE = "/icons/Banner-1.png";

export const revalidate = 60;

async function getShopData(slug: string): Promise<ShopData | null> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || BASE_URL;
    const res = await fetch(`${baseUrl}/api/shop/${slug}`, {
      next: { revalidate: SHOP_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const canonicalUrl = `${BASE_URL}/shop/${slug}`;
  const data = await getShopData(slug);
  if (!data) {
    return {
      title: "Shop Not Found",
      description: "The requested public shop page could not be found.",
      alternates: {
        canonical: `https://erp.bababuilds.com/shop/${slug}`,
      },
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const { shop } = data;
  const title       = `${shop.companyName} — Services & Shop`;
  const description = shop.tagline || `Browse and purchase services from ${shop.companyName}.`;
  const primaryImage = shop.logoUrl || FALLBACK_SOCIAL_IMAGE;
  const openGraphImages = shop.logoUrl
    ? [{ url: shop.logoUrl, width: 1200, height: 630, alt: `${shop.companyName} logo` }]
    : [{ url: FALLBACK_SOCIAL_IMAGE, width: 1536, height: 1024, alt: "BabaBuilds ERP services storefront" }];

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "BabaBuilds ERP",
      images: openGraphImages,
      type:  "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [primaryImage],
    },
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getShopData(slug);
  if (!data) notFound();

  return <ShopClient data={data} />;
}
