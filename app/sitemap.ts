import fs from 'node:fs';
import path from 'node:path';
import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { getAllDocs, groupDocsByCategory } from '@/lib/docs';
import { erpFeatures, featureHref, FEATURES_PATH } from '@/content/marketing/erp-features';

const BASE_URL = 'https://erp.bababuilds.com';

// The release artifact is built on CI against a disposable, empty PostgreSQL database, so a
// build-time render can never contain the real shop slugs, and a time-based revalidate would still
// serve that empty build output for its first interval after every deploy. Render on request
// instead; the shop query below is memoised in-process so crawlers cannot turn this into DB load.
export const dynamic = 'force-dynamic';
const SHOP_SLUG_CACHE_MS = 5 * 60 * 1000;
let shopSlugCache: { at: number; shops: Array<{ slug: string; updatedAt: Date }> } | null = null;
const BUILD_DATE = new Date();

type SitemapEntry = MetadataRoute.Sitemap[number];

const STATIC_ROUTES: Array<{
  route: string;
  changeFrequency: NonNullable<SitemapEntry['changeFrequency']>;
  priority: number;
}> = [
  { route: '', changeFrequency: 'weekly', priority: 1.0 },
  { route: '/help', changeFrequency: 'weekly', priority: 0.9 },
  { route: '/login', changeFrequency: 'monthly', priority: 0.5 },
  { route: '/signup', changeFrequency: 'weekly', priority: 0.85 },
  { route: '/for-agencies', changeFrequency: 'weekly', priority: 0.88 },
  { route: '/for-freelancers', changeFrequency: 'weekly', priority: 0.88 },
  { route: '/for-small-businesses', changeFrequency: 'weekly', priority: 0.88 },
  { route: '/for-contractors', changeFrequency: 'weekly', priority: 0.88 },
  { route: '/for-ca', changeFrequency: 'weekly', priority: 0.88 },
  { route: '/free-erp', changeFrequency: 'monthly', priority: 0.88 },
  { route: '/help-hub', changeFrequency: 'weekly', priority: 0.82 },
  { route: '/reseller', changeFrequency: 'monthly', priority: 0.75 },
  { route: '/reseller/partner-kit', changeFrequency: 'monthly', priority: 0.65 },
  { route: '/tax-engine-scope', changeFrequency: 'monthly', priority: 0.6 },
  { route: '/delete-account', changeFrequency: 'yearly', priority: 0.3 },
  { route: '/privacy', changeFrequency: 'monthly', priority: 0.35 },
  { route: '/terms', changeFrequency: 'monthly', priority: 0.35 },
  { route: '/refund-cancellation', changeFrequency: 'monthly', priority: 0.35 },
];

function getDocLastModified(slug: string): Date {
  const docPath = path.join(process.cwd(), 'content', 'docs', `${slug}.md`);
  try {
    const stats = fs.statSync(docPath);
    return stats.mtime;
  } catch {
    return BUILD_DATE;
  }
}

async function getActiveShopSlugs(): Promise<Array<{ slug: string; updatedAt: Date }>> {
  const shops = await prisma.$queryRaw<Array<{ slug: string; updatedAt: Date }>>`
    SELECT "shopSlug" as slug, "updatedAt" AS "updatedAt"
    FROM "BusinessProfile"
    WHERE "shopEnabled" = true
      AND "shopSlug" IS NOT NULL
    ORDER BY "updatedAt" DESC
  `;

  return shops.map((shop) => ({ slug: shop.slug.toLowerCase(), updatedAt: new Date(shop.updatedAt) }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = STATIC_ROUTES.map(({ route, changeFrequency, priority }) => ({
    url: `${BASE_URL}${route}`,
    lastModified: BUILD_DATE,
    changeFrequency,
    priority,
  }));

  const featureRoutes: MetadataRoute.Sitemap = [
    FEATURES_PATH,
    ...erpFeatures.map(({ slug }) => featureHref(slug)),
  ].map((route) => ({ url: `${BASE_URL}${route}` }));

  const docs = getAllDocs();
  const docRoutes: MetadataRoute.Sitemap = docs.map((doc) => ({
    url: `${BASE_URL}/help/${doc.slug}`,
    lastModified: getDocLastModified(doc.slug),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const categories = groupDocsByCategory(docs).map((g) => g.category.slug);
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((categorySlug) => ({
    url: `${BASE_URL}/help/category/${categorySlug}`,
    lastModified: BUILD_DATE,
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  let shops: Array<{ slug: string; updatedAt: Date }> = [];

  try {
    if (!shopSlugCache || Date.now() - shopSlugCache.at > SHOP_SLUG_CACHE_MS) {
      shopSlugCache = { at: Date.now(), shops: await getActiveShopSlugs() };
    }
    shops = shopSlugCache.shops;
  } catch (error) {
    console.error('Failed to fetch active shop slugs for sitemap generation.', error);
  }

  const shopRoutes: MetadataRoute.Sitemap = shops.map((shop) => ({
    url: `${BASE_URL}/shop/${shop.slug}`,
    lastModified: shop.updatedAt,
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticRoutes, ...featureRoutes, ...categoryRoutes, ...docRoutes, ...shopRoutes] satisfies MetadataRoute.Sitemap;
}
