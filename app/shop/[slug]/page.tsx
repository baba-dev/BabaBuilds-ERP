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

function toAbsoluteUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!value.startsWith("/")) return `${BASE_URL}/${value}`;
  return `${BASE_URL}${value}`;
}

function buildStorefrontJsonLd(data: ShopData) {
  const canonicalUrl = `${BASE_URL}/shop/${data.shop.slug}`;
  const organizationId = `${canonicalUrl}#organization`;
  const itemListId = `${canonicalUrl}#services`;
  const shopImage = toAbsoluteUrl(data.shop.logoUrl) ?? `${BASE_URL}${FALLBACK_SOCIAL_IMAGE}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": organizationId,
        name: data.shop.companyName,
        description: data.shop.tagline || `Public storefront for ${data.shop.companyName}`,
        url: canonicalUrl,
        image: shopImage,
        logo: shopImage,
        email: data.shop.email,
        telephone: data.shop.phone || undefined,
        address: {
          "@type": "PostalAddress",
          streetAddress: data.shop.address,
        },
        sameAs: data.shop.website ? [data.shop.website] : undefined,
      },
      {
        "@type": "ItemList",
        "@id": itemListId,
        name: `${data.shop.companyName} Services`,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: data.services.length,
        itemListElement: data.services.map((service, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${canonicalUrl}#service-${service.id}`,
          item: {
            "@type": "Service",
            "@id": `${canonicalUrl}#service-${service.id}`,
            name: service.name,
            description: service.longDescription || service.description || `Service by ${data.shop.companyName}`,
            image: toAbsoluteUrl(service.imageUrl) || shopImage,
            provider: { "@id": organizationId },
            url: `${canonicalUrl}#service-${service.id}`,
            offers: {
              "@type": "Offer",
              price: service.price.toFixed(2),
              priceCurrency: "INR",
              availability: data.checkout.available
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              url: `${canonicalUrl}#service-${service.id}`,
            },
          },
        })),
      },
    ],
  };
}

function serializeJsonLd(data: ReturnType<typeof buildStorefrontJsonLd>): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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

  const storefrontJsonLd = buildStorefrontJsonLd(data);
  const safeStorefrontJsonLd = serializeJsonLd(storefrontJsonLd);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeStorefrontJsonLd }}
      />
      <ShopClient data={data} />
    </>
  );
}
