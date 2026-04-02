import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone', // Drastically reduces Node.js memory footprint on VPS
  compress: false,      // Offload GZIP/Brotli compression to NGINX for CPU efficiency
};

export default withNextIntl(nextConfig);
