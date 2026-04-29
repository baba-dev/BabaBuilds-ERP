"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StartWithRealBusinessCTA({
  demoTemplate,
  actionCount,
}: {
  demoTemplate?: string | null;
  actionCount: number;
}) {
  const href = `/signup?plan=pro&cycle=monthly&trial=15&fromDemo=1${demoTemplate ? `&demoTemplate=${encodeURIComponent(demoTemplate)}` : ""}&source=demo_cta`;

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:border-orange-900/50 dark:from-orange-950/35 dark:to-amber-950/25">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
            Interactive demo active
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            You completed {actionCount} demo actions. Start with your real business now.
          </p>
        </div>
        <Button asChild className="h-10 rounded-xl font-bold">
          <Link href={href}>
            Start with my real business
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
