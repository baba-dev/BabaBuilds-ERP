"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Soft hero illustration: stacked return sheets, a rupee coin and a verified badge. Decorative only. */
export function GstHeroArt({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const float = (d: number, y = 6) => (reduce ? {} : { animate: { y: [0, -y, 0] }, transition: { duration: 6 + d, repeat: Infinity, ease: "easeInOut" as const, delay: d * 0.4 } });
  return (
    <svg viewBox="0 0 520 240" className={cn("h-full w-full", className)} role="img" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" stopOpacity="0.22" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id={`${id}-sheet`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#eef2ff" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${id}-coin`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={`${id}-ok`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <filter id={`${id}-sh`} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#312e81" floodOpacity="0.18" />
        </filter>
        <pattern id={`${id}-dots`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.1" fill="#6366f1" fillOpacity="0.22" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="520" height="240" rx="28" fill={`url(#${id}-bg)`} />
      <rect x="0" y="0" width="520" height="240" rx="28" fill={`url(#${id}-dots)`} />
      <circle cx="446" cy="40" r="64" fill="#818cf8" fillOpacity="0.16" />
      <circle cx="70" cy="214" r="80" fill="#34d399" fillOpacity="0.14" />

      <motion.g {...float(0, 5)}>
        <g filter={`url(#${id}-sh)`} transform="rotate(-7 190 120)">
          <rect x="118" y="44" width="150" height="176" rx="16" fill={`url(#${id}-sheet)`} />
          <rect x="136" y="64" width="54" height="9" rx="4.5" fill="#6366f1" fillOpacity="0.85" />
          <rect x="136" y="84" width="112" height="5" rx="2.5" fill="#a5b4fc" />
          <rect x="136" y="98" width="96" height="5" rx="2.5" fill="#c7d2fe" />
          <rect x="136" y="112" width="104" height="5" rx="2.5" fill="#c7d2fe" />
          <rect x="136" y="150" width="112" height="40" rx="8" fill="#eef2ff" />
          <rect x="146" y="162" width="40" height="6" rx="3" fill="#818cf8" />
          <rect x="146" y="174" width="64" height="5" rx="2.5" fill="#c7d2fe" />
        </g>
      </motion.g>

      <motion.g {...float(1.2, 7)}>
        <g filter={`url(#${id}-sh)`} transform="rotate(5 300 120)">
          <rect x="232" y="30" width="160" height="186" rx="16" fill={`url(#${id}-sheet)`} />
          <rect x="252" y="52" width="38" height="9" rx="4.5" fill="#10b981" fillOpacity="0.9" />
          <rect x="252" y="72" width="116" height="5" rx="2.5" fill="#a7f3d0" />
          <g fill="#6366f1" fillOpacity="0.85">
            <rect x="254" y="150" width="14" height="34" rx="3" />
            <rect x="274" y="132" width="14" height="52" rx="3" fill="#818cf8" />
            <rect x="294" y="112" width="14" height="72" rx="3" fill="#34d399" />
            <rect x="314" y="124" width="14" height="60" rx="3" fill="#818cf8" />
            <rect x="334" y="100" width="14" height="84" rx="3" />
          </g>
          <path d="M252 196h116" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round" />
        </g>
      </motion.g>

      <motion.g {...float(2.2, 9)}>
        <circle cx="398" cy="150" r="40" fill={`url(#${id}-coin)`} filter={`url(#${id}-sh)`} />
        <circle cx="398" cy="150" r="31" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="3 4" />
        <text x="398" y="162" textAnchor="middle" fontSize="34" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">₹</text>
      </motion.g>

      <motion.g {...float(0.8, 4)}>
        <circle cx="116" cy="62" r="22" fill={`url(#${id}-ok)`} filter={`url(#${id}-sh)`} />
        <path d="M106 62l7 7 12-14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <g fill="#fff" fillOpacity="0.9">
        <circle cx="448" cy="86" r="3" />
        <circle cx="472" cy="110" r="2" />
        <circle cx="62" cy="130" r="2.5" />
      </g>
    </svg>
  );
}

export type EmptyVariant = "returns" | "ledger" | "match" | "clean";

/** Small friendly illustrations for empty states. Decorative only. */
export function EmptyArt({ variant, className }: { variant: EmptyVariant; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 200 140" className={cn("h-32 w-48", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="122" rx="62" ry="8" fill="#6366f1" fillOpacity="0.1" />
      {variant === "returns" && (
        <g>
          <rect x="58" y="22" width="84" height="98" rx="12" fill="#fff" stroke="#c7d2fe" strokeWidth="2" className="dark:fill-zinc-900" />
          <rect x="72" y="38" width="30" height="7" rx="3.5" fill={`url(#${id}-g)`} />
          <rect x="72" y="54" width="56" height="5" rx="2.5" fill="#c7d2fe" />
          <rect x="72" y="66" width="48" height="5" rx="2.5" fill="#e0e7ff" />
          <rect x="72" y="86" width="56" height="20" rx="6" fill="#eef2ff" className="dark:fill-indigo-950" />
          <circle cx="140" cy="100" r="16" fill={`url(#${id}-g)`} />
          <path d="M133 100l5 5 9-10" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {variant === "ledger" && (
        <g>
          <rect x="44" y="30" width="112" height="86" rx="12" fill="#fff" stroke="#c7d2fe" strokeWidth="2" className="dark:fill-zinc-900" />
          <g fill={`url(#${id}-g)`}>
            <rect x="62" y="82" width="14" height="22" rx="3" />
            <rect x="84" y="68" width="14" height="36" rx="3" />
            <rect x="106" y="54" width="14" height="50" rx="3" />
            <rect x="128" y="62" width="14" height="42" rx="3" />
          </g>
          <circle cx="146" cy="38" r="15" fill="#fbbf24" />
          <text x="146" y="45" textAnchor="middle" fontSize="19" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">₹</text>
        </g>
      )}
      {variant === "match" && (
        <g>
          <rect x="30" y="36" width="64" height="76" rx="10" fill="#fff" stroke="#c7d2fe" strokeWidth="2" className="dark:fill-zinc-900" />
          <rect x="106" y="36" width="64" height="76" rx="10" fill="#fff" stroke="#a7f3d0" strokeWidth="2" className="dark:fill-zinc-900" />
          <g fill="#c7d2fe"><rect x="42" y="52" width="40" height="5" rx="2.5" /><rect x="42" y="64" width="30" height="5" rx="2.5" /></g>
          <g fill="#a7f3d0"><rect x="118" y="52" width="40" height="5" rx="2.5" /><rect x="118" y="64" width="30" height="5" rx="2.5" /></g>
          <path d="M94 74h12" stroke={`url(#${id}-g)`} strokeWidth="4" strokeLinecap="round" strokeDasharray="1 7" />
          <circle cx="100" cy="74" r="11" fill={`url(#${id}-g)`} />
          <path d="M95 74l4 4 7-8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {variant === "clean" && (
        <g>
          <path d="M100 20l48 16v34c0 28-20 46-48 56-28-10-48-28-48-56V36z" fill="#fff" stroke="#a7f3d0" strokeWidth="2.5" className="dark:fill-zinc-900" />
          <path d="M100 32l36 12v26c0 21-15 35-36 43-21-8-36-22-36-43V44z" fill={`url(#${id}-g)`} fillOpacity="0.18" />
          <path d="M84 76l11 11 22-24" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  );
}

const EMBLEMS: Record<string, { label: string; from: string; to: string }> = {
  GSTR1: { label: "1", from: "#6366f1", to: "#8b5cf6" },
  IFF: { label: "IFF", from: "#06b6d4", to: "#3b82f6" },
  GSTR3B: { label: "3B", from: "#10b981", to: "#0ea5e9" },
  PMT06: { label: "₹", from: "#f59e0b", to: "#f97316" },
  CMP08: { label: "08", from: "#ec4899", to: "#f43f5e" },
  GSTR4: { label: "4", from: "#ec4899", to: "#a855f7" },
  GSTR9: { label: "9", from: "#0f766e", to: "#14b8a6" },
  GSTR9C: { label: "9C", from: "#334155", to: "#6366f1" },
};

/** Gradient tile identifying a return type. */
export function ReturnEmblem({ type, size = 40, className }: { type: string; size?: number; className?: string }) {
  const e = EMBLEMS[type] ?? EMBLEMS.GSTR1;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-sm ring-1 ring-white/20", className)}
      style={{ width: size, height: size, fontSize: size * (e.label.length > 2 ? 0.28 : 0.4), backgroundImage: `linear-gradient(135deg, ${e.from}, ${e.to})` }}
      aria-hidden
    >
      {e.label}
    </span>
  );
}

/** Ring showing how much of the filing window has elapsed; turns warm as the deadline nears. */
export function DueRing({ progress, tone, children, size = 64 }: { progress: number; tone: "ok" | "soon" | "late" | "done"; children?: React.ReactNode; size?: number }) {
  const reduce = useReducedMotion();
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const color = { ok: "#6366f1", soon: "#f59e0b", late: "#f43f5e", done: "#10b981" }[tone];
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="5" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - clamped) }} transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center leading-none">{children}</span>
    </span>
  );
}
