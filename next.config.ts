import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  output: 'standalone', // Drastically reduces Node.js memory footprint on VPS
  compress: false,      // Offload GZIP/Brotli compression to NGINX for CPU efficiency
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          // Ensure clients fetch the latest SW after each deployment.
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Renamed route: Audit Ledger → Invoices & Earnings
      { source: '/ledger', destination: '/income', permanent: true },
      // Consolidated: standalone New Invoice page → Invoices & Earnings (modal)
      { source: '/invoice', destination: '/income', permanent: false },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
