"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

function useFloat() {
  const reduce = useReducedMotion();
  return (d: number, y = 6) => (reduce ? {} : { animate: { y: [0, -y, 0] }, transition: { duration: 6 + d, repeat: Infinity, ease: "easeInOut" as const, delay: d * 0.4 } });
}

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity="0.2" /><stop offset="1" stopColor="#f59e0b" stopOpacity="0.14" /></linearGradient>
      <linearGradient id={`${id}-sheet`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.96" /><stop offset="1" stopColor="#eef2ff" stopOpacity="0.92" /></linearGradient>
      <linearGradient id={`${id}-coin`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
      <linearGradient id={`${id}-ok`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#059669" /></linearGradient>
      <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#818cf8" /><stop offset="1" stopColor="#4f46e5" /></linearGradient>
      <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#312e81" floodOpacity="0.18" /></filter>
      <pattern id={`${id}-dots`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="#6366f1" fillOpacity="0.2" /></pattern>
    </defs>
  );
}

function Coin({ id, x, y, r = 20 }: { id: string; x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={`url(#${id}-coin)`} />
      <circle cx={x} cy={y} r={r - 4} fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" />
      <text x={x} y={y + r * 0.34} textAnchor="middle" fontSize={r * 0.95} fontWeight="700" fill="#b45309">₹</text>
    </g>
  );
}

/** Hero: a payslip, a calendar page marked pay day, and a stack of rupee coins. Decorative only. */
export function PayrollHeroArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const float = useFloat();
  return (
    <svg viewBox="0 0 520 240" className={cn("h-full w-full", className)} aria-hidden focusable="false">
      <Defs id={id} />
      <rect width="520" height="240" rx="28" fill={`url(#${id}-bg)`} />
      <rect width="520" height="240" rx="28" fill={`url(#${id}-dots)`} />
      <circle cx="448" cy="46" r="62" fill="#818cf8" fillOpacity="0.16" />
      <circle cx="66" cy="214" r="78" fill="#fbbf24" fillOpacity="0.16" />

      <motion.g {...float(0, 5)}>
        <g filter={`url(#${id}-sh)`} transform="rotate(-6 176 124)">
          <rect x="104" y="40" width="156" height="180" rx="16" fill={`url(#${id}-sheet)`} />
          <rect x="122" y="58" width="64" height="9" rx="4.5" fill="#4f46e5" fillOpacity="0.9" />
          <rect x="122" y="78" width="118" height="5" rx="2.5" fill="#c7d2fe" />
          <rect x="122" y="92" width="96" height="5" rx="2.5" fill="#e0e7ff" />
          <rect x="122" y="116" width="52" height="5" rx="2.5" fill="#a5b4fc" />
          <rect x="190" y="116" width="50" height="5" rx="2.5" fill="#a5b4fc" />
          <rect x="122" y="130" width="52" height="5" rx="2.5" fill="#e0e7ff" />
          <rect x="190" y="130" width="50" height="5" rx="2.5" fill="#e0e7ff" />
          <rect x="122" y="160" width="118" height="42" rx="10" fill="#eef2ff" />
          <rect x="132" y="172" width="38" height="6" rx="3" fill="#818cf8" />
          <rect x="132" y="184" width="74" height="9" rx="4.5" fill={`url(#${id}-ink)`} />
        </g>
      </motion.g>

      <motion.g {...float(1.1, 7)}>
        <g filter={`url(#${id}-sh)`} transform="rotate(5 318 120)">
          <rect x="248" y="34" width="150" height="176" rx="16" fill={`url(#${id}-sheet)`} />
          <rect x="248" y="34" width="150" height="40" rx="16" fill={`url(#${id}-ink)`} />
          <rect x="248" y="58" width="150" height="16" fill={`url(#${id}-ink)`} />
          <circle cx="278" cy="34" r="5" fill="#fff" /><circle cx="368" cy="34" r="5" fill="#fff" />
          <text x="323" y="62" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">PAY DAY</text>
          {Array.from({ length: 21 }).map((_, i) => (
            <rect key={i} x={262 + (i % 7) * 18} y={88 + Math.floor(i / 7) * 24} width="12" height="12" rx="3" fill={i === 17 ? "#10b981" : "#c7d2fe"} fillOpacity={i === 17 ? 1 : 0.7} />
          ))}
        </g>
      </motion.g>

      <motion.g {...float(0.6, 6)}>
        <Coin id={id} x={428} y={170} r={26} />
        <Coin id={id} x={452} y={134} r={18} />
        <Coin id={id} x={404} y={206} r={16} />
      </motion.g>
      <motion.g {...float(1.8, 5)}>
        <circle cx="86" cy="62" r="20" fill={`url(#${id}-ok)`} />
        <path d="M76 62.5l7 7 12-14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </svg>
  );
}

/** Empty people list: a small team of avatars with a plus badge. */
export function PeopleArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const float = useFloat();
  const person = (x: number, c1: string, c2: string, s = 1) => (
    <g transform={`translate(${x} 0) scale(${s})`}>
      <circle cx="0" cy="78" r="26" fill={c1} />
      <path d="M-44 150c0-26 20-44 44-44s44 18 44 44v18h-88z" fill={c2} />
    </g>
  );
  return (
    <svg viewBox="0 0 320 200" className={cn("h-full w-full", className)} aria-hidden focusable="false">
      <Defs id={id} />
      <circle cx="160" cy="112" r="88" fill={`url(#${id}-bg)`} />
      <motion.g {...float(0, 4)}>{person(110, "#c7d2fe", "#818cf8", 0.9)}{person(210, "#fde68a", "#fbbf24", 0.9)}</motion.g>
      <motion.g {...float(0.8, 5)} filter={`url(#${id}-sh)`}>{person(160, "#a7f3d0", "#10b981")}</motion.g>
      <motion.g {...float(1.4, 4)}>
        <circle cx="232" cy="52" r="20" fill={`url(#${id}-ink)`} />
        <path d="M232 42v20M222 52h20" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

/** Success: a large ticked coin with sparkles, for a completed month. */
export function PaidArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const float = useFloat();
  return (
    <svg viewBox="0 0 320 200" className={cn("h-full w-full", className)} aria-hidden focusable="false">
      <Defs id={id} />
      <circle cx="160" cy="104" r="86" fill="#10b981" fillOpacity="0.12" />
      <motion.g {...float(0, 5)} filter={`url(#${id}-sh)`}>
        <circle cx="160" cy="104" r="58" fill={`url(#${id}-ok)`} />
        <path d="M132 106l20 20 38-42" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      {[[70, 50, 7], [262, 62, 9], [248, 160, 6], [84, 150, 8]].map(([x, y, r], i) => (
        <motion.circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? "#fbbf24" : "#818cf8"} {...float(i * 0.5, 8)} />
      ))}
    </svg>
  );
}

/** Statutory: a government building with a shield, for PF, ESI, tax and professional tax. */
export function StatutoryArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const float = useFloat();
  return (
    <svg viewBox="0 0 320 200" className={cn("h-full w-full", className)} aria-hidden focusable="false">
      <Defs id={id} />
      <circle cx="160" cy="108" r="88" fill={`url(#${id}-bg)`} />
      <motion.g {...float(0, 4)} filter={`url(#${id}-sh)`}>
        <path d="M90 92L160 52l70 40z" fill={`url(#${id}-ink)`} />
        <rect x="96" y="98" width="128" height="10" rx="3" fill="#c7d2fe" />
        {[108, 138, 168, 198].map((x) => <rect key={x} x={x - 6} y="112" width="14" height="52" rx="4" fill={`url(#${id}-sheet)`} />)}
        <rect x="88" y="168" width="144" height="12" rx="4" fill="#a5b4fc" />
      </motion.g>
      <motion.g {...float(1, 6)}>
        <path d="M244 56l26 9v22c0 17-11 29-26 35-15-6-26-18-26-35V65z" fill={`url(#${id}-ok)`} />
        <path d="M233 90l8 8 15-17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <motion.g {...float(0.4, 5)}><Coin id={id} x={74} y={150} r={20} /></motion.g>
    </svg>
  );
}
