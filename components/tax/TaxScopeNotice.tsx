"use client";

import { BadgeAlert, BadgeCheck, Info } from "lucide-react";
import type { CountryPackVerificationStatus } from "@/lib/tax/country-pack-status";

const messages: Record<CountryPackVerificationStatus, string> = {
  verified:
    "Tax-ready invoicing + compliance workflow. Filing automation is country-pack-gated.",
  partial:
    "Tax-ready invoicing + compliance workflow. Some packs are partially verified, so filing automation remains gated.",
  not_verified:
    "Tax-ready invoicing + compliance workflow. This region requires verified country-pack content before any filing automation claims.",
};

export function TaxScopeNotice({ status }: { status: CountryPackVerificationStatus }) {
  const Icon = status === "verified" ? BadgeCheck : status === "partial" ? Info : BadgeAlert;
  const statusLabel =
    status === "verified" ? "Verified pack" : status === "partial" ? "Partial verification" : "Verification required";

  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em]">{statusLabel}</p>
          <p className="mt-1 text-xs leading-relaxed">{messages[status]}</p>
        </div>
      </div>
    </div>
  );
}
