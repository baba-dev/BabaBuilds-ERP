"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MonitorSmartphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

type ClientPlatform = "android" | "ios" | "desktop";

function detectClientPlatform(): ClientPlatform {
  if (typeof navigator === "undefined") {
    return "desktop";
  }
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) {
    return "android";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "ios";
  }
  return "desktop";
}

function usePublicInstallUrls() {
  return useMemo(
    () => ({
      android: process.env.NEXT_PUBLIC_MOBILE_INSTALL_ANDROID_URL?.trim() || "",
      ios: process.env.NEXT_PUBLIC_MOBILE_INSTALL_IOS_URL?.trim() || "",
      desktop: process.env.NEXT_PUBLIC_MOBILE_INSTALL_DESKTOP_URL?.trim() || "",
    }),
    [],
  );
}

export function MobileNativeInstallSection() {
  const t = useTranslations("Landing.mobileInstall");
  const reduceMotion = useReducedMotion();
  const urls = usePublicInstallUrls();
  const [platform, setPlatform] = useState<ClientPlatform | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only state sync after mount (avoids SSR hydration mismatch)
    setPlatform(detectClientPlatform());
  }, []);

  const trackDownload = (label: string, href: string) => {
    emitMarketingAnalyticsEvent("marketing_cta_click", {
      location: "landing_mobile_install",
      ctaLabel: label,
      href,
    });
  };

  const hasAnyPackage = Boolean(urls.android || urls.ios || urls.desktop);

  return (
    <section className="border-y border-border/80 bg-surface-elevated/40 py-14" id="mobile-install">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.35 }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-body">{t("eyebrow")}</p>
          <h2 className="mt-3 text-balance text-3xl font-black tracking-tight text-foreground md:text-4xl">{t("title")}</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-muted-body md:text-base">{t("subtitle")}</p>
        </motion.div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.05 }}
          className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border/80 bg-surface-elevated p-6 shadow-sm md:p-8"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <div className="flex shrink-0 justify-center md:justify-start">
              <div className="rounded-2xl bg-orange-500/10 p-4 text-orange-600 dark:text-orange-400">
                <MonitorSmartphone className="h-10 w-10" strokeWidth={2.1} aria-hidden />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-5">
              {platform && (
                <p className="inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-orange-500/5 px-3 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t(`hint.${platform}`)}
                </p>
              )}

              <div className="ios-safari rounded-xl border border-border/70 bg-surface-base/80 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-muted-body">{t("iosSafariTitle")}</p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-foreground/90">{t("iosSafariBody")}</p>
              </div>

              {hasAnyPackage ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {urls.android ? (
                    <Button size="lg" className="h-12 rounded-xl font-bold" asChild>
                      <a
                        href={urls.android}
                        rel="noopener noreferrer"
                        download
                        onClick={() => trackDownload(t("ctaAndroid"), urls.android)}
                      >
                        {t("ctaAndroid")}
                      </a>
                    </Button>
                  ) : null}
                  {urls.ios ? (
                    <Button size="lg" variant="outline" className="h-12 rounded-xl border-border/90 font-bold" asChild>
                      <a
                        href={urls.ios}
                        rel="noopener noreferrer"
                        onClick={() => trackDownload(t("ctaIos"), urls.ios)}
                      >
                        {t("ctaIos")}
                      </a>
                    </Button>
                  ) : null}
                  {urls.desktop ? (
                    <Button size="lg" variant="outline" className="h-12 rounded-xl border-border/90 font-bold" asChild>
                      <a
                        href={urls.desktop}
                        rel="noopener noreferrer"
                        download
                        onClick={() => trackDownload(t("ctaDesktop"), urls.desktop)}
                      >
                        {t("ctaDesktop")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm font-medium text-muted-body">{t("packagesPending")}</p>
              )}

              <p className="text-xs font-medium leading-relaxed text-muted-body">{t("pwaHint")}</p>

              <p className="text-xs font-medium text-muted-body">
                <Link href="/settings" className="font-bold text-orange-600 underline-offset-4 hover:underline dark:text-orange-400">
                  {t("settingsLink")}
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
