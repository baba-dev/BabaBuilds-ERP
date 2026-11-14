"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LucideIcon, Sparkles, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DashboardModulePromoCardProps {
  moduleKey: string;
  label: string;
  description: string;
  icon: LucideIcon;
  features: string[];
  onEnabled: () => void;
  className?: string;
}

export function DashboardModulePromoCard({
  moduleKey,
  label,
  description,
  icon: Icon,
  features,
  onEnabled,
  className,
}: DashboardModulePromoCardProps) {
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, enabled: true }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to enable module.");
      }

      toast.success(`${label} Module unlocked!`, {
        description: "Your workspace has been dynamically configured.",
      });

      // Invoke callback to refresh dashboard metrics seamlessly
      onEnabled();
    } catch (err) {
      console.error(err);
      toast.error("Activation failed", {
        description: err instanceof Error ? err.message : "Ensure you have permission to manage workspace settings.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={className}
    >
      <Card className="group relative overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 bg-gradient-to-br from-white via-zinc-50/50 to-zinc-100/30 dark:from-zinc-900/90 dark:via-zinc-950/75 dark:to-zinc-950/40 shadow-xl shadow-zinc-200/30 dark:shadow-black/50 backdrop-blur-md rounded-2xl transition-all duration-500 hover:shadow-2xl hover:shadow-orange-500/5 dark:hover:shadow-orange-500/5 hover:border-orange-500/30 dark:hover:border-orange-500/20">
        {/* Soft Background Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl bg-orange-500/[0.06] dark:bg-orange-500/[0.12] group-hover:bg-orange-500/[0.12] dark:group-hover:bg-orange-500/[0.2] transition-all duration-700 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full blur-2xl bg-indigo-500/[0.04] dark:bg-indigo-500/[0.08] pointer-events-none" />

        {/* Diagonal Light Glare Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent dark:from-white/[0.03] dark:via-transparent dark:to-transparent pointer-events-none" />

        <CardContent className="p-6 relative z-10 flex flex-col h-full justify-between gap-5">
          <div className="space-y-4">
            {/* Header section with icon, label and sparkles badge */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-100/80 dark:border-orange-500/20 shadow-inner group-hover:scale-110 transition-transform duration-500">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-orange-500 animate-pulse" />
                    Optional Suite
                  </span>
                  <h4 className="text-base font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 mt-0.5 leading-snug">
                    {label}
                  </h4>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs font-medium leading-relaxed text-zinc-600 dark:text-zinc-400">
              {description}
            </p>

            {/* Premium Features List */}
            <div className="space-y-2 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
              <p className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Unlocks Capabilities:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-zinc-700 dark:text-zinc-300 font-medium leading-tight"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className="truncate">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Quick Activate CTA */}
          <div className="pt-2">
            <Button
              onClick={handleEnable}
              disabled={loading}
              className="w-full h-10 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-950 font-bold uppercase tracking-wider text-[11px] shadow-lg shadow-zinc-950/10 dark:shadow-white/5 border border-zinc-900/50 dark:border-white/10 hover:shadow-xl transition-all duration-300 group-hover:scale-[1.01] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Activating...
                </>
              ) : (
                <>
                  Enable {label}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
