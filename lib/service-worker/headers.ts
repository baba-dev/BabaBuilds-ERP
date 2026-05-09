export const SERVICE_WORKER_PATH = '/sw.js';
export const SERVICE_WORKER_CACHE_CONTROL = 'no-cache, no-store, must-revalidate';
export const SERVICE_WORKER_CONTENT_TYPE = 'application/javascript; charset=UTF-8';

export const serviceWorkerHeaders = [
  { key: 'Content-Type', value: SERVICE_WORKER_CONTENT_TYPE },
  { key: 'Cache-Control', value: SERVICE_WORKER_CACHE_CONTROL },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Cloudflare-CDN-Cache-Control', value: 'no-store' },
  { key: 'Pragma', value: 'no-cache' },
  { key: 'Expires', value: '0' },
] as const;
