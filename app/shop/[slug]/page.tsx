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

async function getShopData(slug: string): Promise<ShopData | null> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/shop/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getShopData(slug);
  if (!data) return { title: "Shop Not Found" };

  const { shop } = data;
  const title       = `${shop.companyName} — Services & Shop`;
  const description = shop.tagline || `Browse and purchase services from ${shop.companyName}.`;

  return {
    title,
    description,
    openGraph: {
      title, description,
      images: shop.logoUrl ? [{ url: shop.logoUrl }] : [],
      type:  "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getShopData(slug);
  if (!data) notFound();

  return <ShopClient data={data} />;
}
