import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownToLine, FileText, MessageSquareText, PlayCircle, Presentation, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LandingNavbar from "@/components/LandingNavbar";
import LandingFooter from "@/components/LandingFooter";
import { RoiCalculator } from "@/components/reseller/RoiCalculator";

export const metadata: Metadata = {
  title: "Reseller Partner Kit | BabaBuilds ERP",
  description:
    "Download the official reseller partner kit: deck, pricing sheet, WhatsApp script, objection sheet, onboarding checklist, and ROI calculator.",
  alternates: {
    canonical: "https://erp.bababuilds.com/reseller/partner-kit",
  },
};

const kitAssets = [
  {
    title: "Partner deck",
    description: "Pitch storyline, ICP, and conversion flow for partner-led demos.",
    href: "/api/reseller/partner-kit/sales-deck",
    icon: Presentation,
  },
  {
    title: "1-page pricing sheet",
    description: "Customer-facing pricing summary with reseller discount positioning.",
    href: "/api/reseller/partner-kit/pricing-sheet",
    icon: FileText,
  },
  {
    title: "WhatsApp script",
    description: "Message templates for outreach, follow-up, and demo booking.",
    href: "/api/reseller/partner-kit/whatsapp-script",
    icon: MessageSquareText,
  },
  {
    title: "Objection sheet",
    description: "Fast responses to common commercial and product objections.",
    href: "/api/reseller/partner-kit/objection-sheet",
    icon: ShieldCheck,
  },
  {
    title: "Onboarding checklist",
    description: "Step-by-step partner activation and first customer launch checklist.",
    href: "/api/reseller/partner-kit/onboarding-checklist",
    icon: FileText,
  },
];

export default function ResellerPartnerKitPage() {
  return (
    <div className="min-h-screen bg-surface-base text-foreground">
      <LandingNavbar />
      <main className="pt-28">
        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="rounded-3xl border border-border/80 bg-surface-elevated p-7 shadow-sm md:p-10">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-body">Partner enablement</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">Reseller partner kit</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-body md:text-base">
              Download ready-to-use partner assets and run the ROI calculator before pitching. Every file is optimized
              for fast customer conversations and cleaner close rates.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-14">
          <div className="grid gap-4 md:grid-cols-2">
            {kitAssets.map((asset) => {
              const Icon = asset.icon;
              return (
                <Card key={asset.title} className="rounded-2xl border-border/80 bg-surface-elevated">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <Icon className="h-5 w-5 text-orange-600" />
                      {asset.title}
                    </CardTitle>
                    <CardDescription>{asset.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild className="h-10 rounded-xl font-bold">
                      <Link href={asset.href}>
                        Download
                        <ArrowDownToLine className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-14">
          <RoiCalculator />
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-20">
          <Card className="rounded-2xl border-border/80 bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlayCircle className="h-5 w-5" />
                Demo walkthrough
              </CardTitle>
              <CardDescription className="text-zinc-200 dark:text-zinc-700">
                Share this sample demo when a partner asks for the product narrative in action.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="h-10 rounded-xl font-bold">
                <Link href="/reseller">Open reseller demo page</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
