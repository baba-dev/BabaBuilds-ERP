"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Menu, ReceiptText, Receipt, Users } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { appNavItems } from "@/components/navigation/nav-config";
import { cn } from "@/lib/utils";

/**
 * Full-screen "focus" routes (composers with their own sticky action bar). The bottom tab bar is
 * hidden here so it never stacks with the composer's own fixed footer.
 */
const FOCUS_ROUTE_PATTERNS: RegExp[] = [
  /^\/income\/new(\/|$)/,
  /^\/proposals\/new(\/|$)/,
  /^\/proposals\/[^/]+\/edit(\/|$)/,
  /^\/retainers\/new(\/|$)/,
  /^\/retainers\/[^/]+\/edit(\/|$)/,
  /^\/pos(\/|$)/,
];

export function isFocusRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return FOCUS_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

const TAB_ITEMS = [
  { key: "home", href: "/dashboard", icon: LayoutDashboard },
  { key: "invoices", href: "/income", icon: ReceiptText },
  { key: "clients", href: "/clients", icon: Users },
  { key: "expenses", href: "/expenses", icon: Receipt },
] as const;

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Thumb-reachable primary navigation for phones. Hidden from md and up (sidebar takes over). */
export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("MobileNav");
  const { setOpenMobile, openMobile } = useSidebar();

  if (isFocusRoute(pathname) || pathname === "/login") return null;

  const tabBase =
    "relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

  return (
    <nav
      aria-label={t("primary_nav")}
      data-slot="mobile-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-safe ps-safe pe-safe shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.25)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {TAB_ITEMS.map(({ key, href, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={key} className="flex flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(tabBase, active ? "text-[color:var(--accent-strong)]" : "text-muted-foreground active:text-foreground")}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-[color:var(--accent-soft)]",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="max-w-full truncate">{t(key)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-haspopup="dialog"
            aria-expanded={openMobile}
            className={cn(tabBase, "text-muted-foreground active:text-foreground")}
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" aria-hidden />
            </span>
            <span className="max-w-full truncate">{t("more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

/** Resolves the current section to its sidebar translation key so the top bar can show a real title. */
export function getSectionKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = [...appNavItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  if (match) return match.key;
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}
