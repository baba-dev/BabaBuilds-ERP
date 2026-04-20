"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BellRing,
  Calculator,
  FileSignature,
  Globe,
  MonitorSmartphone,
  Package,
  Receipt,
  Shield,
  Sparkles,
  Store,
  UsersRound,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type FeatureKey =
  | "premiumProposals"
  | "automatedInvoicing"
  | "zeroEffortRetainers"
  | "storeCatalog"
  | "expenseLedger"
  | "bankReconciliation"
  | "clientCrm"
  | "multiChannelNotifications"
  | "globalCompliance"
  | "caCompliance"
  | "multiLevelRoles"
  | "inventoryHub"
  | "pwaImplementation"
  | "nativeApps";

const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  premiumProposals: FileSignature,
  automatedInvoicing: Receipt,
  zeroEffortRetainers: Zap,
  storeCatalog: Store,
  expenseLedger: BarChart3,
  bankReconciliation: Calculator,
  clientCrm: UsersRound,
  multiChannelNotifications: BellRing,
  globalCompliance: Globe,
  caCompliance: Shield,
  multiLevelRoles: UsersRound,
  inventoryHub: Package,
  pwaImplementation: MonitorSmartphone,
  nativeApps: MonitorSmartphone,
};

const FEATURE_COLORS: Record<FeatureKey, { color: string; bg: string }> = {
  premiumProposals: { color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
  automatedInvoicing: { color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30" },
  zeroEffortRetainers: { color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30" },
  storeCatalog: { color: "text-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30" },
  expenseLedger: { color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950/30" },
  bankReconciliation: { color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  clientCrm: { color: "text-orange-700", bg: "bg-orange-100/80 dark:bg-orange-950/25" },
  multiChannelNotifications: { color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30" },
  globalCompliance: { color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  caCompliance: { color: "text-teal-500", bg: "bg-teal-50 dark:bg-teal-950/30" },
  multiLevelRoles: { color: "text-orange-700", bg: "bg-orange-100/70 dark:bg-orange-950/25" },
  inventoryHub: { color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
  pwaImplementation: { color: "text-amber-700", bg: "bg-amber-100/70 dark:bg-amber-950/25" },
  nativeApps: { color: "text-green-500", bg: "bg-green-50 dark:bg-green-950/30" },
};

const PILLARS: Array<{
  id: "getPaid" | "control" | "compliance" | "scale";
  keys: FeatureKey[];
}> = [
  { id: "getPaid", keys: ["premiumProposals", "automatedInvoicing", "zeroEffortRetainers", "storeCatalog"] },
  { id: "control", keys: ["expenseLedger", "bankReconciliation", "clientCrm", "multiChannelNotifications"] },
  { id: "compliance", keys: ["globalCompliance", "caCompliance", "multiLevelRoles"] },
  { id: "scale", keys: ["inventoryHub", "pwaImplementation", "nativeApps"] },
];

/** Matches `LandingPhase1.featurePriorities` keys for micro-labels */
const FEATURE_PRIORITY_KEY: Record<
  FeatureKey,
  | "velocity"
  | "automation"
  | "conversion"
  | "commerce"
  | "control"
  | "confidence"
  | "relationships"
  | "alerts"
  | "global"
  | "auditing"
  | "security"
  | "logistics"
  | "offline"
  | "intelligence"
> = {
  premiumProposals: "conversion",
  automatedInvoicing: "velocity",
  zeroEffortRetainers: "automation",
  storeCatalog: "commerce",
  expenseLedger: "control",
  bankReconciliation: "confidence",
  clientCrm: "relationships",
  multiChannelNotifications: "alerts",
  globalCompliance: "global",
  caCompliance: "auditing",
  multiLevelRoles: "security",
  inventoryHub: "logistics",
  pwaImplementation: "offline",
  nativeApps: "intelligence",
};

export default function LandingFeaturePillars() {
  const t = useTranslations("Landing.features.items");
  const tFeatures = useTranslations("Landing.features");
  const tp1 = useTranslations("LandingPhase1");
  const to = useTranslations("Landing.featuresByOutcome");
  const reduceMotion = useReducedMotion();

  return (
    <section id="features" className="bg-surface-base py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <m.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.4 }}
          className="mb-14 max-w-3xl space-y-4"
        >
          <h2 className="text-3xl font-black tracking-tight text-foreground md:text-5xl">
            <span className="text-foreground">Everything you need to </span>
            <span className="text-orange-600 dark:text-orange-400">scale with speed.</span>
          </h2>
          <p className="text-lg font-medium leading-relaxed text-muted-body">{tFeatures("description")}</p>
        </m.div>

        <LazyMotion features={domAnimation}>
          <div className="grid gap-10 lg:grid-cols-12">
            {PILLARS.map((pillar, pIdx) => (
              <m.div
                key={pillar.id}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.38, delay: reduceMotion ? 0 : pIdx * 0.06 }}
                className={cn(
                  "rounded-3xl border border-border/90 bg-surface-elevated p-6 shadow-sm md:p-8",
                  pillar.id === "getPaid" && "lg:col-span-5",
                  pillar.id === "control" && "lg:col-span-7",
                  pillar.id === "compliance" && "lg:col-span-6",
                  pillar.id === "scale" && "lg:col-span-6",
                )}
              >
                <div className="mb-6 flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-foreground md:text-2xl">{to(`${pillar.id}.title`)}</h3>
                    <p className="mt-1 text-sm font-medium text-muted-body">{to(`${pillar.id}.description`)}</p>
                  </div>
                </div>
                <ul className="space-y-4">
                  {pillar.keys.map((key, i) => {
                    const Icon = FEATURE_ICONS[key];
                    const colors = FEATURE_COLORS[key];
                    return (
                      <m.li
                        key={key}
                        initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.2 }}
                        transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
                        className="flex gap-4 rounded-2xl border border-transparent p-2 transition hover:border-orange-400/25 hover:bg-orange-50/50 dark:hover:border-orange-800/30 dark:hover:bg-orange-950/15"
                      >
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                            colors.bg,
                          )}
                        >
                          <Icon className={cn("h-5 w-5", colors.color)} strokeWidth={2.25} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-body">
                            {tp1(`featurePriorities.${FEATURE_PRIORITY_KEY[key]}`)}
                          </p>
                          <p className="font-bold text-foreground">{t(`${key}.title`)}</p>
                          <p className="mt-0.5 text-sm font-medium leading-relaxed text-muted-body">
                            {t(`${key}.description`)}
                          </p>
                        </div>
                      </m.li>
                    );
                  })}
                </ul>
              </m.div>
            ))}
          </div>
        </LazyMotion>
      </div>
    </section>
  );
}
