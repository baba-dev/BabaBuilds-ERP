import { MetadataRoute } from 'next';

const AUTHENTICATED_TOP_LEVEL_PATHS = [
  '/admin/',
  '/ca-portal/',
  '/clients/',
  '/dashboard/',
  '/expenses/',
  '/inbox/',
  '/inventory/',
  '/invoice/',
  '/launch/',
  '/ledger/',
  '/proposals/',
  '/reconciliation/',
  '/retainers/',
  '/services/',
  '/settings/',
  '/setup/',
  '/tax/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: [
          '/api/',
          '/authenticated/',
          '/p/',
          ...AUTHENTICATED_TOP_LEVEL_PATHS,
        ],
      },
    ],
    sitemap: 'https://erp.bababuilds.com/sitemap.xml',
  };
}
