"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Soft hero illustration: a calendar sheet with ticked days and a signed-off shield. Decorative only. */
export function CaHeroArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const float = (d: number, y = 5) => (reduce ? {} : { animate: { y: [0, -y, 0] }, transition: { duration: 6 + d, repeat: Infinity, ease: "easeInOut" as const, delay: d * 0.4 } });
  const days = Array.from({ length: 15 }, (_, i) => i);
  return (
    <svg viewBox="0 0 260 200" className={cn("h-full w-full", className)} role="img" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-sheet`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="1" stopColor="#eef2ff" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={`${id}-ok`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id={`${id}-head`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <circle cx="210" cy="40" r="46" fill="#6366f1" opacity="0.08" />
      <circle cx="40" cy="170" r="34" fill="#10b981" opacity="0.08" />
      <motion.g {...float(0)}>
        <rect x="34" y="28" width="168" height="140" rx="16" fill={`url(#${id}-sheet)`} stroke="#c7d2fe" strokeOpacity="0.7" />
        <path d="M34 44a16 16 0 0 1 16-16h136a16 16 0 0 1 16 16v14H34z" fill={`url(#${id}-head)`} />
        <rect x="66" y="20" width="8" height="18" rx="4" fill="#4338ca" />
        <rect x="162" y="20" width="8" height="18" rx="4" fill="#4338ca" />
        {days.map((i) => {
          const x = 52 + (i % 5) * 28;
          const y = 74 + Math.floor(i / 5) * 28;
          const done = i === 1 || i === 3 || i === 6 || i === 7 || i === 11;
          const late = i === 9;
          return <rect key={i} x={x} y={y} width="18" height="18" rx="5" fill={done ? "#34d399" : late ? "#fb7185" : "#e0e7ff"} opacity={done || late ? 0.9 : 0.8} />;
        })}
      </motion.g>
      <motion.g {...float(1, 7)}>
        <path d="M200 96l32 12v26c0 20-13 34-32 42-19-8-32-22-32-42v-26z" fill={`url(#${id}-ok)`} />
        <path d="M186 138l10 10 20-22" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  );
}

/** Calm empty-state mark used by tabs with nothing to show. */
export function EmptyMark({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-emerald-50 text-indigo-600 shadow-sm ring-1 ring-indigo-200/60 dark:from-indigo-500/15 dark:to-emerald-500/10 dark:text-indigo-300 dark:ring-indigo-400/20", className)}>
      {children}
    </span>
  );
}
