import type { Viewport, Metadata } from "next";
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

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: '#0062ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "BabaBuilds ERP",
  description: "Internal compliance and financial management system.",
  applicationName: "BabaBuilds ERP",
  appleWebApp: {
    capable: true,
    title: "BabaBuilds ERP",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
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

              <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col transition-colors duration-300">
                <main className="flex-1 relative">
                  {children}
                </main>
              </div>

              <Toaster richColors position="bottom-right" />
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
