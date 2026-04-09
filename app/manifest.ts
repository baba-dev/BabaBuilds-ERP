import { MetadataRoute } from 'next';

const defaultShortcutIcon = {
  src: '/icons/launchericon-192x192.png',
  sizes: '192x192',
  type: 'image/png',
} as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BabaBuilds ERP',
    short_name: 'BabaBuilds',
    description: 'Internal compliance and financial management system.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0062ff',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      {
        src: '/icons/launchericon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/launchericon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/BabaBuillds_ERP_Logo.png',
        sizes: '500x500',
        type: 'image/png',
      },
    ],
    screenshots: [
      {
        src: '/banners',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Dashboard overview with business insights',
      },
      {
        src: '/icons/windows/Wide310x150Logo.scale-400.png',
        sizes: '1240x600',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Invoices and financial workflow overview',
      },
      {
        src: '/splash',
        sizes: '1024x1536',
        type: 'image/png',
        label: 'BabaBuilds ERP mobile portrait splash',
      },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View business overview and KPIs',
        url: '/dashboard',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Service Catalog',
        short_name: 'Services',
        description: 'Manage service offerings',
        url: '/services',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Client CRM',
        short_name: 'Clients',
        description: 'Manage client profiles and contacts',
        url: '/clients',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Quotes & Proposals',
        short_name: 'Proposals',
        description: 'Create and track proposals',
        url: '/proposals',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Invoices',
        short_name: 'Invoice',
        description: 'Create and manage invoices',
        url: '/invoice',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Retainers Hub',
        short_name: 'Retainers',
        description: 'Track retainers and MRR',
        url: '/retainers',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Expenses & Margins',
        short_name: 'Expenses',
        description: 'Review expenses and profitability',
        url: '/expenses',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Savings & Tax',
        short_name: 'Tax',
        description: 'Tax planning and liabilities',
        url: '/tax',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'AI Reconciliation',
        short_name: 'Reconcile',
        description: 'Reconcile transactions with AI support',
        url: '/reconciliation',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Audit Ledger',
        short_name: 'Ledger',
        description: 'Inspect ledger and audit trails',
        url: '/ledger',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'CA Compliance',
        short_name: 'CA Portal',
        description: 'Compliance and chartered accountant workflows',
        url: '/ca-portal',
        icons: [defaultShortcutIcon],
      },
    ],
  };
}
