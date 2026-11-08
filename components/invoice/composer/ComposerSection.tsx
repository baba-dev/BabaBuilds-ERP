"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  step: number;
  title: string;
  hint?: string;
  done?: boolean;
  delay?: number;
  children: ReactNode;
  className?: string;
};

/** A numbered card. The badge turns into a check once the section is complete. */
export function ComposerSection({ step, title, hint, done = false, delay = 0, children, className }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6", className)}
      aria-labelledby={`composer-step-${step}`}
    >
      <header className="mb-4 flex items-start gap-3 sm:mb-5">
        <motion.span
          key={done ? "done" : "todo"}
          initial={reduce ? false : { scale: 0.7 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors",
            done ? "bg-emerald-500 text-white" : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" /> : step}
        </motion.span>
        <div className="min-w-0">
          <h2 id={`composer-step-${step}`} className="text-base font-semibold leading-8 tracking-tight">
            {title}
          </h2>
          {hint && <p className="-mt-1 text-sm text-muted-foreground">{hint}</p>}
        </div>
      </header>
      {children}
    </motion.section>
  );
}
