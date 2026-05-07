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
    const cspReportOnly = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
          },
          { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
        ],
      },
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
