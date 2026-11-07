import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  BadgeCheck,
  Box,
  Coins,
  FileCheck2,
  FileText,
  KeyRound,
  Landmark,
  Link2,
  PenLine,
  Receipt,
  ShieldCheck,
  Users,
} from "lucide-react";
import ShowcaseTip from "@/components/auth/ShowcaseTip";

const STEPS = [
  { key: "proposal", icon: FileText },
  { key: "esign", icon: PenLine },
  { key: "invoice", icon: Receipt },
  { key: "payment", icon: Link2 },
  { key: "bank", icon: Landmark },
  { key: "export", icon: FileCheck2 },
] as const;

const FEATURES = [
  { key: "passkeys", icon: KeyRound },
  { key: "tax", icon: BadgeCheck },
  { key: "currency", icon: Coins },
  { key: "roles", icon: Users },
] as const;

const BARS = [38, 52, 44, 66, 58, 74, 62, 86, 70, 92, 80, 100];

/**
 * Left-hand brand panel for desktop `/login` (hidden below `lg`).
 * Server component: only the tooltip wrappers are client code.
 * Always dark so it stays a strong brand surface in both themes.
 */
export default async function LoginShowcase() {
  const t = await getTranslations("LoginPage.showcase");

  return (
    <aside
      aria-label={t("ariaLabel")}
      className="relative hidden overflow-hidden bg-[#0c0a08] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:gap-6 lg:p-10 xl:p-14"
    >
      {/* Static layered glow — gradients only, no blur filters */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -start-40 -top-40 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(234,88,12,0.5),transparent_65%)]" />
        <div className="absolute -bottom-52 -end-40 size-[640px] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.28),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_80%_70%_at_30%_40%,black,transparent_75%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
      </div>

      <header className="relative z-10 login-fade-up" style={{ ["--d" as string]: "0" }}>
        <Link href="/" className="group inline-flex items-center gap-3" aria-label="BabaBuilds ERP">
          <span className="flex size-11 items-center justify-center rounded-xl bg-orange-600 shadow-lg shadow-orange-600/30 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105">
            <Box className="size-6 text-white" aria-hidden />
          </span>
          <span className="text-2xl font-black tracking-tight">BabaBuilds</span>
        </Link>
      </header>

      <div className="relative z-10 space-y-8">
        <div className="login-fade-up space-y-4" style={{ ["--d" as string]: "80" }}>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold tracking-wide text-orange-200">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("eyebrow")}
          </p>
          <h2 className="max-w-xl text-balance text-4xl font-black leading-[1.08] tracking-tight xl:text-5xl">
            {t("headline")}
          </h2>
          <p className="max-w-lg text-pretty text-base leading-relaxed text-white/70">{t("subhead")}</p>
        </div>

        {/* Workflow */}
        <ol className="login-fade-up grid max-w-xl grid-cols-3 gap-3" style={{ ["--d" as string]: "160" }}>
          {STEPS.map(({ key, icon: Icon }, index) => (
            <li key={key}>
              <ShowcaseTip
                content={t(`steps.${key}.tip`)}
                className="group h-full cursor-help rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 outline-none transition-colors hover:border-orange-400/50 hover:bg-white/[0.08] focus-visible:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-400/60"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-900/40 transition-transform duration-300 group-hover:-translate-y-0.5">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-white/35">0{index + 1}</span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-tight">{t(`steps.${key}.title`)}</p>
              </ShowcaseTip>
            </li>
          ))}
        </ol>

        {/* Decorative product preview */}
        <div
          className="login-fade-up relative max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-2xl shadow-black/40 [@media(max-height:1000px)]:hidden"
          style={{ ["--d" as string]: "240" }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/90">{t("preview.title")}</p>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
              {t("preview.sample")}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm" aria-hidden>
            {(["invoiced", "collected", "outstanding"] as const).map((k, i) => (
              <div key={k} className="rounded-xl bg-black/25 p-3">
                <p className="text-[11px] text-white/50">{t(`preview.${k}`)}</p>
                <div
                  className={`mt-2 h-2.5 rounded-full ${
                    i === 0 ? "w-4/5 bg-white/70" : i === 1 ? "w-3/5 bg-emerald-400/80" : "w-2/5 bg-amber-400/80"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-20 items-end gap-1.5" aria-hidden>
            {BARS.map((h, i) => (
              <span
                key={i}
                className="login-rise flex-1 rounded-t-md bg-gradient-to-t from-orange-600/80 to-amber-400/90"
                style={{ height: `${h}%`, ["--i" as string]: i }}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="relative z-10 space-y-4 login-fade-up" style={{ ["--d" as string]: "320" }}>
        <ul className="flex flex-wrap gap-2">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key}>
              <ShowcaseTip
                side="bottom"
                content={t(`features.${key}.tip`)}
                className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/80 outline-none transition-colors hover:border-orange-400/50 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-400/60"
              >
                <Icon className="size-3.5 text-orange-300" aria-hidden />
                {t(`features.${key}.title`)}
              </ShowcaseTip>
            </li>
          ))}
        </ul>
        <p className="text-xs text-white/45 [@media(max-height:760px)]:hidden">{t("securityNote")}</p>
      </footer>
    </aside>
  );
}
