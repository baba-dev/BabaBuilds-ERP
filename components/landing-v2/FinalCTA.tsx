"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DemoLaunchButton } from "@/components/landing/persona/DemoLaunchButton";
import { emitMarketingAnalyticsEvent } from "@/lib/marketing-analytics";

export default function FinalCTA() {
  return (
    <section className="px-6">
      <div className="mx-auto max-w-7xl rounded-3xl border border-border bg-foreground px-6 py-10 text-white sm:px-8">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to run proposal to payment in one workflow?</h2>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <DemoLaunchButton
            templateKey="dm_agency"
            label="Try Live Demo"
            analyticsContext="home_v2_final"
            onLaunchStart={() => emitMarketingAnalyticsEvent("home_v2_final_demo_click", { location: "final", templateKey: "dm_agency" })}
            className="h-12 rounded-xl border-white/20 bg-white text-zinc-900 hover:bg-zinc-100"
          />
          <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10" data-cta="final-start-free" data-surface="home-v2-final">
            <Link href="/signup?plan=pro&cycle=monthly&trial=15&source=home-v2_final" onClick={() => emitMarketingAnalyticsEvent("home_v2_final_start_free_click", { location: "final", href: "/signup" })}>Start Free</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
