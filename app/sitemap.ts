import { MetadataRoute } from 'next';
import { getAllDocs } from '@/lib/docs';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://erp.bababuilds.com';

  // Base routes
  const routes = [
    '',
    '/help',
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 1.0,
  }));

  // Dynamic help docs from MDX
  const docs = getAllDocs();
  const docRoutes = docs.map((doc) => ({
    url: `${baseUrl}/help/${doc.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [...routes, ...docRoutes];
}
