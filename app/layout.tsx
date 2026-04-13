import type { Viewport, Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";

import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import SetupGatekeeper from "@/components/SetupGatekeeper";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { validateAuthEnvOrThrow } from "@/lib/auth-observability";
import { getLocaleDirection } from "@/lib/i18n";
import PWARegistration from "@/components/PWARegistration";
import OfflineSyncBanner from "@/components/offline-sync-banner";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: '#0062ff',
  width: 'device-width',
  initialScale: 1,
};

const SITE_URL = "https://erp.bababuilds.com";
const ORGANIZATION_NAME = "BabaBuilds";
const ORGANIZATION_LOGO_URL = `${SITE_URL}/icons/BabaBuillds_ERP_Logo.png`;
const ORGANIZATION_SAME_AS = ["https://github.com/BabaBuilds-ERP"];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BabaBuilds ERP — Automated Invoicing, Reconciliation & Tax Compliance",
    template: "%s | BabaBuilds ERP",
  },
  description:
    "The all-in-one ERP for agencies and freelancers. Automate multi-currency invoicing, GST/VAT compliance, AI-powered bank reconciliation, and real-time financial dashboards — trusted by businesses across India, the Middle East, and LATAM.",
  applicationName: "BabaBuilds ERP",
  keywords: [
    "ERP for freelancers",
    "automated invoicing software",
    "GST compliance ERP",
    "VAT invoicing Oman",
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
        url: "/icons/Banner-1.png",
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
    images: ["/icons/Banner-1.png"],
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  validateAuthEnvOrThrow();
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = getLocaleDirection(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {/* ── Structured Data: Organization ── */}
        <Script
          id="ld-json-organization"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: ORGANIZATION_NAME,
              url: SITE_URL,
              logo: ORGANIZATION_LOGO_URL,
              sameAs: ORGANIZATION_SAME_AS,
              contactPoint: {
                "@type": "ContactPoint",
                email: "admin@bababuilds.com",
                contactType: "customer support",
                availableLanguage: ["English", "Hindi", "Arabic", "Spanish"],
              },
            }),
          }}
        />
        {/* ── Structured Data: SoftwareApplication ── */}
        <Script
          id="ld-json-software-application"
          type="application/ld+json"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "BabaBuilds ERP",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android, iOS",
              url: SITE_URL,
              image: `${SITE_URL}/icons/Banner-1.png`,
              description:
                "All-in-one ERP for agencies: automated invoicing, multi-currency billing, GST/VAT compliance, AI reconciliation, and financial dashboards.",
              author: {
                "@type": "Organization",
                name: ORGANIZATION_NAME,
                url: SITE_URL,
              },
              publisher: {
                "@type": "Organization",
                name: ORGANIZATION_NAME,
                url: SITE_URL,
                logo: {
                  "@type": "ImageObject",
                  url: ORGANIZATION_LOGO_URL,
                },
                sameAs: ORGANIZATION_SAME_AS,
              },
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "INR",
                availability: "https://schema.org/InStock",
              },
              screenshot: `${SITE_URL}/icons/Banner-1.png`,
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

              <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-colors duration-300 relative">
                {/* Background decorative blob elements - wrapped to not break sticky */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full" />
                  <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-violet-600/5 blur-[100px] rounded-full" />
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
