"use client";

import { useState } from "react";
import { m, LazyMotion, domAnimation } from "framer-motion";
import { 
  FileText, Bell, CreditCard, Landmark, 
  Calculator, Users, Package, Clock, 
  UserCircle, Folder, BarChart, Handshake 
} from "lucide-react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const featureKeys = [
  { id: "invoicing", icon: FileText, colSpan: "md:col-span-2" },
  { id: "reminders", icon: Bell, colSpan: "md:col-span-1" },
  { id: "expenses", icon: CreditCard, colSpan: "md:col-span-1" },
  { id: "bank", icon: Landmark, colSpan: "md:col-span-2" },
  { id: "tax", icon: Calculator, colSpan: "md:col-span-2" },
  { id: "payroll", icon: Users, colSpan: "md:col-span-1" },
  { id: "inventory", icon: Package, colSpan: "md:col-span-1" },
  { id: "retainers", icon: Clock, colSpan: "md:col-span-1" },
  { id: "crm", icon: UserCircle, colSpan: "md:col-span-1" },
  { id: "docs", icon: Folder, colSpan: "md:col-span-1" },
  { id: "reporting", icon: BarChart, colSpan: "md:col-span-1" },
  { id: "partner", icon: Handshake, colSpan: "md:col-span-1" },
] as const;

export default function FeaturesBentoV3() {
  const t = useTranslations("LandingV3.Features");
  const [selectedFeature, setSelectedFeature] = useState<typeof featureKeys[number] | null>(null);

  return (
    <section className="py-24 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 md:text-5xl">
            {t("title1")} <br />
            <span className="text-orange-600 dark:text-orange-500">{t("title2")}</span>
          </h2>
          <p className="mt-6 text-lg text-zinc-600 dark:text-zinc-300">
            {t("subtitle")}
          </p>
        </div>

        <LazyMotion features={domAnimation}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {featureKeys.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <m.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => setSelectedFeature(feature)}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 transition-all hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-orange-500/50",
                    feature.colSpan
                  )}
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 transition-transform group-hover:scale-110 dark:bg-orange-500/10 dark:text-orange-400">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {t(`items.${feature.id}.title` as Parameters<typeof t>[0])}
                  </h3>
                  <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {t(`items.${feature.id}.shortDesc` as Parameters<typeof t>[0])}
                  </p>
                </m.div>
              );
            })}
          </div>
        </LazyMotion>
      </div>

      <ResponsiveDialog
        open={!!selectedFeature}
        onOpenChange={(open) => !open && setSelectedFeature(null)}
        title={
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
              {selectedFeature && <selectedFeature.icon className="h-5 w-5" />}
            </div>
            {selectedFeature && t(`items.${selectedFeature.id}.title` as Parameters<typeof t>[0])}
          </div>
        }
      >
        <div className="py-4 text-zinc-600 dark:text-zinc-300">
          <p className="text-base leading-relaxed">
            {selectedFeature && t(`items.${selectedFeature.id}.details` as Parameters<typeof t>[0])}
          </p>
        </div>
      </ResponsiveDialog>
    </section>
  );
}
