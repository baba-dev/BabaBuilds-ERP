import type { Viewport, Metadata } from "next";
import Script from "next/script";
import { Inter, Noto_Naskh_Arabic } from "next/font/google";

import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import SetupGatekeeper from "@/components/SetupGatekeeper";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getLocaleDirection } from "@/lib/i18n";
import PWARegistration from "@/components/PWARegistration";
import OfflineSyncBanner from "@/components/offline-sync-banner";

const inter = Inter({ subsets: ["latin"] });
const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ["arabic"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: '#0062ff',
  width: 'device-width',
  initialScale: 1,
};

const SITE_URL = "https://erp.bababuilds.com";
const DEFAULT_SOCIAL_BANNER_PATH = "/icons/Banner-1.png";
const FAVICON_PATH = "/icons/BabaBuillds_ERP_Logo.png";
const DEFAULT_SOCIAL_BANNER_URL = `${SITE_URL}${DEFAULT_SOCIAL_BANNER_PATH}`;
const FAVICON_URL = `${SITE_URL}${FAVICON_PATH}`;
const ORGANIZATION_NAME = "BabaBuilds";
const ORGANIZATION_LOGO_URL = FAVICON_URL;
  const ORGANIZATION_SAME_AS = [
    "https://github.com/BabaBuilds-ERP",
    "https://twitter.com/bababuilds",
  ];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BabaBuilds ERP — Automated Invoicing, Reconciliation & Tax Compliance",
    template: "%s | BabaBuilds ERP",
  },
  description:
    "The all-in-one ERP for agencies and freelancers. Automate multi-currency invoicing, GST/VAT workflows with country-aware setup defaults, AI-powered bank reconciliation, and real-time financial dashboards.",
  applicationName: "BabaBuilds ERP",
  keywords: [
    "ERP for freelancers",
    "automated invoicing software",
    "GST compliance ERP",
    "VAT invoicing Oman",
    "VAT invoicing UAE",
    "VAT invoicing Saudi Arabia",
    "multi-currency invoicing",
    "bank reconciliation software",
    "agency finance management",
    "MSME invoicing India",
    "SaaS bookkeeping tool",
    "BabaBuilds ERP",
  ],
  authors: [{ name: "BabaBuilds", url: SITE_URL }],
  creator: "BabaBuilds",
  publisher: "BabaBuilds",
  referrer: "origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: FAVICON_PATH, type: "image/png", sizes: "512x512" },
      { url: FAVICON_PATH, type: "image/png", sizes: "192x192" },
    ],
    shortcut: [FAVICON_PATH],
    apple: [{ url: FAVICON_PATH, type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    alternateLocale: ["hi_IN", "ar_OM", "es_MX"],
    url: SITE_URL,
    siteName: "BabaBuilds ERP",
    title: "BabaBuilds ERP — Run Your Agency on Autopilot",
    description:
      "Multi-currency invoicing, AI-powered reconciliation, and global tax compliance for modern agencies and freelancers.",
    images: [
      {
        url: DEFAULT_SOCIAL_BANNER_PATH,
        width: 1536,
        height: 1024,
        alt: "BabaBuilds ERP Dashboard — Invoicing, Reconciliation & Tax Compliance",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BabaBuilds ERP — Automated Invoicing & Compliance",
    description:
      "The global command center for bookkeeping and growth. Automate invoices, manage clients, and track expenses.",
    images: [DEFAULT_SOCIAL_BANNER_PATH],
    creator: "@bababuilds",
  },
  appleWebApp: {
    capable: true,
    title: "BabaBuilds ERP",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  category: "Business Software",
  other: {
    "msapplication-TileColor": "#0062ff",
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = getLocaleDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body
        className={dir === "rtl" ? notoNaskhArabic.className : inter.className}
        suppressHydrationWarning
      >
        {/* ── Structured Data: SEO graph for SERP rich results ── */}
        <Script
          id="ld-json-seo-graph"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: ORGANIZATION_NAME,
                  url: SITE_URL,
                  logo: {
                    "@type": "ImageObject",
                    "@id": `${SITE_URL}/#primary-logo`,
                    url: ORGANIZATION_LOGO_URL,
                    contentUrl: ORGANIZATION_LOGO_URL,
                    width: 1024,
                    height: 1024,
                  },
                  sameAs: ORGANIZATION_SAME_AS,
                  contactPoint: {
                    "@type": "ContactPoint",
                    email: "admin@bababuilds.com",
                    contactType: "customer support",
                    availableLanguage: ["English", "Hindi", "Arabic", "Spanish"],
                  },
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  url: SITE_URL,
                  name: "BabaBuilds ERP",
                  publisher: {
                    "@id": `${SITE_URL}/#organization`,
                  },
                  inLanguage: ["en", "hi", "ar", "es"],
                },
                {
                  "@type": "WebPage",
                  "@id": `${SITE_URL}/#webpage`,
                  url: SITE_URL,
                  name: "BabaBuilds ERP — Automated Invoicing, Reconciliation & Tax Compliance",
                  isPartOf: {
                    "@id": `${SITE_URL}/#website`,
                  },
                  about: {
                    "@id": `${SITE_URL}/#organization`,
                  },
                  primaryImageOfPage: {
                    "@type": "ImageObject",
                    "@id": `${SITE_URL}/#primary-banner`,
                    url: DEFAULT_SOCIAL_BANNER_URL,
                    contentUrl: DEFAULT_SOCIAL_BANNER_URL,
                    width: 1536,
                    height: 1024,
                  },
                  description:
                    "The all-in-one ERP for agencies and freelancers. Automate multi-currency invoicing, GST/VAT workflows, AI reconciliation, and real-time dashboards.",
                },
                {
                  "@type": "SoftwareApplication",
                  "@id": `${SITE_URL}/#software`,
                  name: "BabaBuilds ERP",
                  applicationCategory: "BusinessApplication",
                  applicationSubCategory: "Accounting, Billing and Tax Compliance",
                  operatingSystem: "Web, Android, iOS",
                  url: SITE_URL,
                  image: DEFAULT_SOCIAL_BANNER_URL,
                  description:
                    "All-in-one ERP for agencies: automated invoicing, multi-currency billing, country-aware GST/VAT workflows, AI reconciliation, and financial dashboards.",
                  author: {
                    "@id": `${SITE_URL}/#organization`,
                  },
                  publisher: {
                    "@id": `${SITE_URL}/#organization`,
                  },
                  offers: {
                    "@type": "Offer",
                    url: `${SITE_URL}/signup`,
                    availability: "https://schema.org/InStock",
                    description:
                      "Free tier and paid plans with trials; see signup and pricing for current options.",
                  },
                  screenshot: DEFAULT_SOCIAL_BANNER_URL,
                  featureList: [
                    "Automated invoicing",
                    "AI-powered bank reconciliation",
                    "Country-aware GST/VAT setup",
                    "Multi-currency accounting",
                    "Client and project financial dashboards",
                  ],
                },
              ],
            }),
          }}
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AuthProvider>
              {/* THE GATEKEEPER: 
                  Placed here so it has access to the Auth context. 
                  It will now globally monitor if the user needs to complete setup.
              */}
              <SetupGatekeeper />
              <PWARegistration />
              <OfflineSyncBanner />

              <div className="min-h-screen bg-surface-base text-foreground flex flex-col transition-colors duration-300 relative">
                {/* Background decorative blob elements - wrapped to not break sticky */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-accent-strong/10 blur-[120px] rounded-full" />
                  <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent-soft/50 blur-[100px] rounded-full" />
                </div>
                
                <main className="flex-1 relative z-10">
                  {children}
                </main>
              </div>

              <Toaster richColors position="top-center" />
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
