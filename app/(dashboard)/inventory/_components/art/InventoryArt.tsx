"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Warehouse shelves with boxes, a clipboard and a gauge. Decorative; hidden from assistive tech. */
export function InventoryArt({ className, variant = "hero" }: { className?: string; variant?: "hero" | "empty" | "ok" }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const bob = (d: number) => (reduce ? {} : { animate: { y: [0, -5, 0] }, transition: { duration: 5 + d, repeat: Infinity, ease: "easeInOut" as const, delay: d * 0.3 } });
  return (
    <svg viewBox="0 0 320 220" className={cn("h-auto w-full", className)} aria-hidden="true" role="presentation">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity="0.18" /><stop offset="1" stopColor="#10b981" stopOpacity="0.14" /></linearGradient>
        <linearGradient id={`${id}-box`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#d97706" /></linearGradient>
        <linearGradient id={`${id}-box2`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
        <linearGradient id={`${id}-box3`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#059669" /></linearGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#312e81" floodOpacity="0.18" /></filter>
      </defs>
      <rect x="6" y="8" width="308" height="204" rx="26" fill={`url(#${id}-bg)`} />
      <g filter={`url(#${id}-sh)`}>
        <rect x="40" y="46" width="172" height="136" rx="10" fill="#fff" fillOpacity="0.92" />
        <rect x="40" y="94" width="172" height="5" fill="#c7d2fe" />
        <rect x="40" y="140" width="172" height="5" fill="#c7d2fe" />
        <rect x="40" y="46" width="5" height="136" fill="#c7d2fe" />
        <rect x="207" y="46" width="5" height="136" fill="#c7d2fe" />
      </g>
      <motion.g {...bob(0.2)}><rect x="54" y="62" width="44" height="32" rx="5" fill={`url(#${id}-box)`} /><rect x="68" y="62" width="16" height="10" fill="#fff" fillOpacity="0.55" /></motion.g>
      <motion.g {...bob(0.6)}><rect x="106" y="70" width="38" height="24" rx="5" fill={`url(#${id}-box2)`} /><rect x="118" y="70" width="14" height="8" fill="#fff" fillOpacity="0.5" /></motion.g>
      {variant !== "empty" ? <g><rect x="152" y="58" width="46" height="36" rx="5" fill={`url(#${id}-box3)`} /><rect x="166" y="58" width="18" height="10" fill="#fff" fillOpacity="0.5" /></g> : null}
      {variant !== "empty" ? <g><rect x="54" y="108" width="52" height="32" rx="5" fill={`url(#${id}-box2)`} /><rect x="114" y="116" width="40" height="24" rx="5" fill={`url(#${id}-box)`} /></g> : null}
      <g><rect x="160" y="154" width="40" height="28" rx="5" fill={`url(#${id}-box3)`} /><rect x="56" y="154" width="44" height="28" rx="5" fill={`url(#${id}-box)`} /></g>
      <motion.g {...bob(0.9)} filter={`url(#${id}-sh)`}>
        <rect x="232" y="56" width="62" height="84" rx="9" fill="#fff" />
        <rect x="252" y="50" width="22" height="12" rx="4" fill="#4f46e5" />
        {[0, 1, 2].map((i) => <g key={i}><rect x="242" y={76 + i * 20} width="10" height="10" rx="3" fill={i === 1 ? "#f59e0b" : "#10b981"} /><rect x="258" y={79 + i * 20} width="28" height="4" rx="2" fill="#c7d2fe" /></g>)}
      </motion.g>
      <circle cx="262" cy="172" r="22" fill="#fff" fillOpacity="0.9" /><path d="M246 174a16 16 0 0 1 32 0" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
      <path d="M262 174l9-9" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" /><circle cx="262" cy="174" r="3" fill="#4f46e5" />
    </svg>
  );
}
