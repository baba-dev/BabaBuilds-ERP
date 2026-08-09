"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import FloatingPreferencesWidget from "@/components/landing/FloatingPreferencesWidget";
import { DemoLaunchButton } from "@/components/landing/persona/DemoLaunchButton";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

export type FreeErpLimits = {
  clients: number;
  monthlyInvoices: number;
  shopServices: number;
  seats: number;
};

type ComparisonRow = {
  label: string;
  free: string;
  pro: string;
  team: string;
};

type ResourceLink = {
  slug: string;
  label: string;
};

export default function FreeErpArticle({ limits }: { limits: FreeErpLimits }) {
  const t = useTranslations("LandingFreeErp");
  const comparisonRows = t.raw("comparison.rows") as ComparisonRow[];
  const resourceLinks = t.raw("resources.links") as ResourceLink[];
  const introParagraphs = t.raw("introParagraphs") as string[];
  const revenueParagraphs = t.raw("revenueParagraphs") as string[];
  const moneyParagraphs = t.raw("moneyParagraphs") as string[];
  const complianceParagraphs = t.raw("complianceParagraphs") as string[];
  const optionalParagraphs = t.raw("optionalParagraphs") as string[];
  const teamParagraphs = t.raw("teamParagraphs") as string[];

  return (
    <div className="min-h-screen bg-surface-base">
      <LandingNavbar />

      <main className="px-6 pb-24 pt-28">
        <article className="prose prose-zinc mx-auto max-w-3xl dark:prose-invert prose-headings:font-black prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline">
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
            {t("lastUpdated")}
          </p>
          <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {t("h1")}
          </h1>

          <div className="not-prose my-8 flex flex-col gap-4 sm:flex-row">
            <Button size="lg" className="h-14 rounded-2xl px-8 text-base font-black" asChild>
              <Link
                href="/signup"
                onClick={() =>
                  emitMarketingAnalyticsEvent("trial_cta_click", {
                    source: "free-erp",
                    label: t("cta.signupLabel"),
                  })
                }
              >
                {t("cta.signupLabel")}
                <ArrowRight className="ms-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-14 rounded-2xl px-8 text-base font-bold" asChild>
              <Link
                href="/signup?plan=pro&cycle=monthly&trial=15&source=free-erp"
                onClick={() =>
                  emitMarketingAnalyticsEvent("trial_cta_click", {
                    source: "free-erp",
                    label: t("cta.trialLabel"),
                  })
                }
              >
                {t("cta.trialLabel")}
              </Link>
            </Button>
            <DemoLaunchButton
              templateKey="freelancer_consultant"
              label={t("cta.demoLabel")}
              analyticsContext="page:free-erp"
              className="h-14 rounded-2xl px-8 text-base font-bold"
            />
          </div>

          {introParagraphs.map((p, i) => (
            <p key={`intro-${i}`}>{p}</p>
          ))}

          <section className="not-prose my-10 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6 dark:border-orange-400/20 dark:bg-orange-500/10">
            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-50">{t("glance.title")}</h2>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">{t("glance.intro")}</p>
            <ul className="mt-4 list-disc space-y-2 ps-5 text-zinc-800 dark:text-zinc-200">
              <li>{t("glance.bullets.modules")}</li>
              <li>{t("glance.bullets.clients", { count: limits.clients })}</li>
              <li>{t("glance.bullets.invoices", { count: limits.monthlyInvoices })}</li>
              <li>{t("glance.bullets.shop", { count: limits.shopServices })}</li>
              <li>{t("glance.bullets.payments")}</li>
              <li>{t("glance.bullets.seats", { count: limits.seats })}</li>
            </ul>
          </section>

          <h2>{t("revenue.title")}</h2>
          {revenueParagraphs.map((p, i) => (
            <p key={`rev-${i}`}>{p}</p>
          ))}

          <h2>{t("money.title")}</h2>
          {moneyParagraphs.map((p, i) => (
            <p key={`money-${i}`}>{p}</p>
          ))}

          <h2>{t("compliance.title")}</h2>
          {complianceParagraphs.map((p, i) => (
            <p key={`comp-${i}`}>{p}</p>
          ))}

          <h2>{t("optional.title")}</h2>
          {optionalParagraphs.map((p, i) => (
            <p key={`opt-${i}`}>{p}</p>
          ))}

          <h2>{t("team.title")}</h2>
          {teamParagraphs.map((p, i) => (
            <p key={`team-${i}`}>{p}</p>
          ))}

          <h2>{t("comparison.title")}</h2>
          <p>{t("comparison.subtitle")}</p>
          <div className="not-prose my-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <th className="p-3 font-black text-zinc-900 dark:text-zinc-50">{t("comparison.colFeature")}</th>
                  <th className="p-3 font-black text-orange-800 dark:text-orange-200">{t("comparison.colFree")}</th>
                  <th className="p-3 font-black text-zinc-900 dark:text-zinc-50">{t("comparison.colPro")}</th>
                  <th className="p-3 font-black text-zinc-900 dark:text-zinc-50">{t("comparison.colTeam")}</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(comparisonRows) &&
                  comparisonRows.map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                    >
                      <td className="p-3 font-semibold text-zinc-800 dark:text-zinc-200">{row.label}</td>
                      <td className="p-3 text-zinc-600 dark:text-zinc-400">{row.free}</td>
                      <td className="p-3 text-zinc-600 dark:text-zinc-400">{row.pro}</td>
                      <td className="p-3 text-zinc-600 dark:text-zinc-400">{row.team}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2>{t("resources.title")}</h2>
          <ul>
            {Array.isArray(resourceLinks) &&
              resourceLinks.map((link) => (
                <li key={link.slug}>
                  <Link href={`/help/${link.slug}`}>{link.label}</Link>
                </li>
              ))}
          </ul>

          <section className="not-prose mt-12 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-50">{t("cta.closingTitle")}</h2>
            <p className="mt-2 text-zinc-600 dark:text-zinc-300">{t("cta.closingBody")}</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button size="lg" className="h-12 rounded-xl font-black" asChild>
                <Link href="/signup">{t("cta.signupLabel")}</Link>
              </Button>
              <DemoLaunchButton
                templateKey="freelancer_consultant"
                label={t("cta.demoLabel")}
                analyticsContext="page:free-erp-footer"
                className="h-12 rounded-xl font-bold"
              />
            </div>
          </section>
        </article>
      </main>

      <LandingFooter />
      <FloatingPreferencesWidget />
    </div>
  );
}
