import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { serviceWorkerHeaders } from './lib/service-worker/headers';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development' || process.env.ERP_STAGING_MODE === '1',
});

const nextConfig: NextConfig = {
  output: 'standalone', // Drastically reduces Node.js memory footprint on VPS
  compress: false,      // Offload GZIP/Brotli compression to NGINX for CPU efficiency
  // Invoice PDF fonts are read from disk at runtime, so the standalone trace must ship them.
  outputFileTracingIncludes: {
    '/*': ['./assets/invoice-fonts/**/*'],
    '/api/**': ['./assets/invoice-fonts/**/*'],
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    const staging = process.env.ERP_STAGING_MODE === '1';
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://challenges.cloudflare.com"
      : "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://challenges.cloudflare.com";

    const csp = staging ? [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "frame-src 'none'",
      "form-action 'self'",
      "worker-src 'none'",
      "object-src 'none'",
    ].join('; ') : [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      scriptSrc,
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com",
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
          { key: 'Content-Security-Policy', value: csp },
          ...(staging ? [
            { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
            { key: 'Cache-Control', value: 'no-store, private' },
          ] : []),
        ],
      },
      {
        source: '/sw.js',
        // Keep the service worker MIME type and cache policy explicit at the
        // Next.js layer; proxy.ts applies the same headers to the generated
        // bundle so proxies/CDNs never infer or retain stale values.
        headers: [...serviceWorkerHeaders],
      },
    ];
  },
  async redirects() {
    return [
      // Renamed route: Audit Ledger → Invoices & Earnings
      { source: '/ledger', destination: '/income', permanent: true },
      // Consolidated: standalone New Invoice page → Invoices & Earnings (modal)
      { source: '/invoice', destination: '/income', permanent: false },
      // In-app help lives at /help (the old page only redirected; do it before rendering)
      { source: '/dashboard/help', destination: '/help', permanent: true },
      // Cash Flow is one workspace now; the old sub-pages (and links to them in emails or notifications) land there.
      { source: '/cash-flow/:section(overview|inflows|outflows|variance|alerts|manual-adjustments|scenarios|assumptions)', destination: '/cash-flow', permanent: false },
    ];
  },
};

export default withSerwist(withNextIntl(nextConfig));
