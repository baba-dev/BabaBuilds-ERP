import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeDollarSign, Handshake, LifeBuoy, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "BabaBuilds ERP Reseller Program",
  description:
    "Join the BabaBuilds ERP reseller program. Offer clients a first-year discount, earn commissions, and get partner enablement support.",
  alternates: {
    canonical: "https://erp.bababuilds.com/reseller",
  },
};

const partnerTypes = [
  "Consultants who manage client operations and finance stack",
  "Accountants/CA firms offering implementation + advisory",
  "Digital/automation agencies with recurring retainers",
  "Local IT partners serving SMB ERP rollouts",
];

const supportItems = [
  "Sales deck, objection handling sheets, and ROI calculator",
  "Co-branded launch collateral and onboarding checklist",
  "Partner enablement sessions with live product demos",
  "Dedicated partner support channel with priority turnaround",
];

export default function ResellerPage() {
  return (
    <main className="bg-surface-base px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl space-y-12">
        <section className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 md:p-12">
          <p className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
            <Handshake className="h-3.5 w-3.5" /> Partner Program
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            Grow with BabaBuilds ERP as a Reseller
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-zinc-600 dark:text-zinc-300">
            Build a predictable acquisition channel by helping clients modernize invoicing, compliance, and operations.
            Partners get both customer discounts and commission upside on closed deals.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link href="/api/auth/signin">
                Apply as Reseller <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/help">Book Partner Call</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Users className="h-5 w-5 text-orange-600" /> Who can become a reseller
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              {partnerTypes.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BadgeDollarSign className="h-5 w-5 text-emerald-600" /> Commission + discount structure
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              <p>Customer offer: <strong>25% off first year</strong> by default.</p>
              <p>Partner incentive: <strong>10–15% commission</strong> on closed paid deals.</p>
              <p>Both values are configurable in admin for strategic partners and campaigns.</p>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Route className="h-4 w-4 text-indigo-500" /> How leads are tracked
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-300">
              Unique coupon codes map each referred workspace to a reseller profile. This powers usage, revenue,
              conversion, and renewal analytics.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payout terms</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-300">
              Standard payout terms are <strong>Net 30</strong> after payment clearance, with clear ledger-level
              commission tracking and payout status.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LifeBuoy className="h-4 w-4 text-amber-500" /> Partner enablement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              {supportItems.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
