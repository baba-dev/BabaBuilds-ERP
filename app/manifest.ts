import { MetadataRoute } from 'next';
import { getLocale } from 'next-intl/server';
import { getLocaleDirection } from '@/lib/i18n';

type FileHandlerEntry = {
  action: string;
  accept: Record<string, string[]>;
};

const erpFileHandlers: FileHandlerEntry[] = [
  {
    action: '/open-file',
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
  },
];

const defaultShortcutIcon = {
  src: '/icons/launchericon-192x192.png',
  sizes: '192x192',
  type: 'image/png',
} as const;

type ShareTargetField = {
  share_target: {
    action: string;
    method: 'POST';
    enctype: 'multipart/form-data';
    params: {
      title: string;
      text: string;
      url: string;
      files: Array<{
        name: string;
        accept: string[];
      }>;
    };
  };
};

export default async function manifest(): Promise<
  MetadataRoute.Manifest & 
  ShareTargetField & {
    launch_handler: {
      client_mode: 'focus-existing';
    };
    file_handlers: FileHandlerEntry[];
  }
> {
  const locale = await getLocale();
  const dir = getLocaleDirection(locale);

  const webManifest: MetadataRoute.Manifest & ShareTargetField & {
    launch_handler: {
      client_mode: 'focus-existing';
    };
    file_handlers: FileHandlerEntry[];
  } = {
    id: '/',
    name: 'BabaBuilds ERP',
    short_name: 'BabaBuilds',
    description: 'Internal compliance and financial management system.',
    lang: locale,
    dir,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    launch_handler: {
      client_mode: 'focus-existing',
    },
    orientation: 'any',
    background_color: '#ffffff',
    theme_color: '#0062ff',
    categories: ['business', 'finance', 'productivity'],
    // We intentionally omit `prefer_related_applications` and `related_applications`
    // because BabaBuilds ERP does not currently publish native companion apps.
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
        purpose: 'any',
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
        src: '/icons/Banner-1.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'BabaBuilds ERP Features Slide 1 - Wide',
      },
      {
        src: '/icons/Banner-2.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'BabaBuilds ERP Features Slide 2 - Wide',
      },
      {
        src: '/icons/Banner-3.png',
        sizes: '1536x1024',
        type: 'image/png',
        form_factor: 'wide',
        label: 'BabaBuilds ERP Features Slide 3 - Wide',
      },
      {
        src: '/icons/Splash-Tablet-Portrait.png',
        sizes: '1024x1536',
        type: 'image/png',
        label: 'BabaBuilds ERP mobile portrait splash',
      },
    ],
    file_handlers: erpFileHandlers,
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'files',
            accept: ['image/*', 'application/pdf'],
          },
        ],
      },
    },
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View business overview and KPIs',
        url: '/dashboard',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'Invoices',
        short_name: 'Invoice',
        description: 'Create and manage invoices',
        url: '/income',
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
        name: 'Expenses & Margins',
        short_name: 'Expenses',
        description: 'Review expenses and profitability',
        url: '/expenses',
        icons: [defaultShortcutIcon],
      },
      {
        name: 'AI Reconciliation',
        short_name: 'Reconcile',
        description: 'Reconcile transactions with AI support',
        url: '/reconciliation',
        icons: [defaultShortcutIcon],
      },
    ],
    protocol_handlers: [
      {
        protocol: 'web+erp',
        url: '/launch?url=%s',
      },
    ],
  };

  return webManifest;
}
