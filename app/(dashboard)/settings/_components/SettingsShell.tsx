"use client";

import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { activeKey, GROUP_ORDER, NAV, type NavEntry } from "@/lib/settings/nav";
import { NavIcon } from "./nav-icon";
import { DirtyContext, SettingsDataProvider, useDirty } from "./settings-data";

function Nav() {
  const t = useTranslations("SettingsHub");
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { isDirty, setDirty } = useDirty();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const current = activeKey(pathname, params.get("section"));

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => NAV.filter((n) => !q || t(`nav.${n.key}`).toLowerCase().includes(q) || t(`navHint.${n.key}`).toLowerCase().includes(q) || n.keywords.some((k) => k.includes(q))), [q, t]);

  // Leaving with unsaved edits asks first.
  const go = (e: React.MouseEvent, n: NavEntry) => {
    if (n.key === current) return;
    if (isDirty() && !window.confirm(t("leaveConfirm"))) { e.preventDefault(); return; }
    setDirty(false);
    setOpen(false);
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(n.href);
  };

  // On a phone the map folds into one button so the page itself is the first thing on screen.
  return (
    <nav aria-label={t("navLabel")} className="space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="settings-map" className="flex w-full items-center justify-between rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-sm font-medium shadow-sm lg:hidden">
        <span className="flex items-center gap-2"><NavIcon name={NAV.find((n) => n.key === current)?.icon ?? "FileText"} className="size-4" />{t(`nav.${current}`)}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">{t("sections")}<ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden /></span>
      </button>
      <div id="settings-map" className={cn("space-y-4", open ? "block" : "hidden lg:block")}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-9 ps-9" />
      </div>
      {visible.length === 0 ? <p className="px-1 text-sm text-muted-foreground">{t("noMatch")}</p> : null}
      {GROUP_ORDER.map((g) => {
        const items = visible.filter((n) => n.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t(`groups.${g}`)}</p>
            <ul className="space-y-0.5">
              {items.map((n) => (
                <li key={n.key}>
                  <Link href={n.href} onClick={(e) => go(e, n)} aria-current={n.key === current ? "page" : undefined}
                    className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", n.key === current ? "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                    <NavIcon name={n.icon} className="size-4 shrink-0" />
                    <span className="truncate">{t(`nav.${n.key}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      </div>
    </nav>
  );
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const dirtyRef = useRef(false);
  const setDirty = useCallback((v: boolean) => { dirtyRef.current = v; }, []);
  const isDirty = useCallback(() => dirtyRef.current, []);
  const value = useMemo(() => ({ setDirty, isDirty }), [setDirty, isDirty]);
  return (
    <DirtyContext.Provider value={value}>
      <SettingsDataProvider>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 lg:flex-row lg:gap-8 lg:px-6">
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:w-60 lg:shrink-0 lg:overflow-y-auto">
            <Suspense fallback={null}><Nav /></Suspense>
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </SettingsDataProvider>
    </DirtyContext.Provider>
  );
}
