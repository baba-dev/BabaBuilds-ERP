import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BabaBuilds ERP',
    short_name: 'BabaBuilds',
    description: 'Internal compliance and financial management system.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0062ff',
    icons: [
      {
        src: '/icons/android/launchericon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/android/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/android/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'New Invoice',
        short_name: 'Invoice',
        description: 'Create a new invoice',
        url: '/invoice/create',
        icons: [{ src: '/icons/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View Dashboard',
        url: '/dashboard',
        icons: [{ src: '/icons/android/launchericon-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
