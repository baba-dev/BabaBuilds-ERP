"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Building2, ChevronDown, LayoutDashboard, Network, ScrollText, ShieldCheck, Store, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; hint: string; icon: LucideIcon; match: (p: string) => boolean };

const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: "Platform", items: [
    { href: "/admin", label: "Overview", hint: "Health, revenue and what needs you", icon: LayoutDashboard, match: (p) => p === "/admin" },
    { href: "/admin/accounts", label: "Accounts", hint: "Workspaces, plans and members", icon: Building2, match: (p) => p.startsWith("/admin/accounts") },
  ] },
  { title: "Trust and operations", items: [
    { href: "/admin/security", label: "Security", hint: "Sign-in failures, configuration, access", icon: ShieldCheck, match: (p) => p.startsWith("/admin/security") },
    { href: "/admin/operations", label: "Operations", hint: "Backups and maintenance", icon: Wrench, match: (p) => p.startsWith("/admin/operations") },
    { href: "/admin/logs", label: "Activity log", hint: "Who did what, platform-wide", icon: ScrollText, match: (p) => p.startsWith("/admin/logs") },
    { href: "/admin/system-health", label: "Diagnostics", hint: "Incidents and approvals", icon: Activity, match: (p) => p.startsWith("/admin/system-health") },
  ] },
  { title: "Partners", items: [
    { href: "/admin/distributors", label: "Distributors", hint: "Coupons, commissions, payouts", icon: Network, match: (p) => p.startsWith("/admin/distributors") },
    { href: "/admin/resellers", label: "Resellers", hint: "Reseller coupons and commissions", icon: Store, match: (p) => p.startsWith("/admin/resellers") },
  ] },
];

export function AdminShell({ email, environment, children }: { email: string; environment: "production" | "development"; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const flat = GROUPS.flatMap((g) => g.items);
  const current = flat.find((i) => i.match(pathname)) ?? flat[0];
  useEffect(() => { setOpen(false); }, [pathname]);
  const CurrentIcon = current.icon;
  // These pages bring their own heading.
  const ownsHeader = ["/admin/distributors", "/admin/resellers", "/admin/system-health", "/admin/style-gallery"].some((p) => pathname.startsWith(p));

  return (
    <div className="min-h-app bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white"><ShieldCheck className="size-4" aria-hidden /></span>
            <div className="leading-tight"><p className="text-sm font-semibold">Platform admin</p><p className="text-[11px] text-muted-foreground">Visible only to super admins</p></div>
            <span className={cn("ms-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", environment === "production" ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20" : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20")}>{environment}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="truncate" title={email}>{email}</span>
            <Link href="/dashboard" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">Back to ERP</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-8 lg:px-6">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-60 lg:shrink-0 lg:self-start lg:overflow-y-auto">
          <nav aria-label="Admin sections" className="space-y-3">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="admin-map" className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm lg:hidden">
              <span className="flex items-center gap-2"><CurrentIcon className="size-4" aria-hidden />{current.label}</span>
              <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <div id="admin-map" className={cn("space-y-4", open ? "block" : "hidden lg:block")}>
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</p>
                  <ul className="space-y-0.5">
                    {g.items.map((i) => {
                      const Icon = i.icon;
                      const active = i === current;
                      return (
                        <li key={i.href}>
                          <Link href={i.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                            <Icon className="size-4 shrink-0" aria-hidden /><span className="truncate">{i.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 space-y-5" aria-labelledby={ownsHeader ? undefined : "admin-title"}>
          {ownsHeader ? null : <div><h1 id="admin-title" className="text-2xl font-bold tracking-tight">{current.label}</h1><p className="mt-1 text-sm text-muted-foreground">{current.hint}</p></div>}
          {children}
        </main>
      </div>
    </div>
  );
}
