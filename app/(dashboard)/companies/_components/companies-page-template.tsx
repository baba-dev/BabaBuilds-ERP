import Link from "next/link";
import {
  BarChart3,
  Building2,
  CreditCard,
  FileBarChart2,
  PlusCircle,
  Settings2,
  ShieldCheck,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { cn } from "@/lib/utils";

export type CompaniesPageKey =
  | "overview"
  | "create"
  | "access"
  | "dashboard"
  | "reports"
  | "billing"
  | "settings";

type CompaniesNavItem = {
  key: CompaniesPageKey;
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const companiesNavItems: CompaniesNavItem[] = [
  {
    key: "overview",
    title: "Companies Overview",
    href: "/companies",
    description: "Review companies, setup health, modules, and operating status.",
    icon: Building2,
  },
  {
    key: "create",
    title: "Create Company",
    href: "/companies/create",
    description: "Add a legal entity with local country, currency, and setup defaults.",
    icon: PlusCircle,
  },
  {
    key: "access",
    title: "Access & Team",
    href: "/companies/access-team",
    description: "Manage group roles and company-specific access boundaries.",
    icon: Users2,
  },
  {
    key: "dashboard",
    title: "Consolidated Dashboard",
    href: "/companies/consolidated-dashboard",
    description: "Monitor group KPIs and cross-company operating signals.",
    icon: BarChart3,
  },
  {
    key: "reports",
    title: "Consolidated Reports",
    href: "/companies/consolidated-reports",
    description: "Prepare financial and compliance packs across the group.",
    icon: FileBarChart2,
  },
  {
    key: "billing",
    title: "Billing & Usage",
    href: "/companies/billing-usage",
    description: "Track group plan, billing workspace, seats, and enabled modules.",
    icon: CreditCard,
  },
  {
    key: "settings",
    title: "Settings",
    href: "/companies/settings",
    description: "Configure group identity, defaults, and consolidation governance.",
    icon: Settings2,
  },
];

const pageDetails: Record<CompaniesPageKey, {
  eyebrow: string;
  title: string;
  description: string;
  checklist: string[];
  primaryAction?: { label: string; href: string };
}> = {
  overview: {
    eyebrow: "Group workspace",
    title: "Companies Overview",
    description: "A control centre for every company connected to the active group, including setup status, access coverage, and module readiness.",
    checklist: ["Review active and archived companies", "Confirm local country and base currency", "Audit enabled modules before switching context"],
    primaryAction: { label: "Create company", href: "/companies/create" },
  },
  create: {
    eyebrow: "Company setup",
    title: "Create Company",
    description: "Start a new company with country, currency, module, and setup defaults aligned to the active group.",
    checklist: ["Capture legal and display name", "Assign country and base currency", "Choose initial modules and team access"],
  },
  access: {
    eyebrow: "Governance",
    title: "Access & Team",
    description: "Keep user access intentional with group roles, all-company access, and company-specific permissions.",
    checklist: ["Review group administrators", "Validate all-company access", "Limit sensitive company access by role"],
  },
  dashboard: {
    eyebrow: "Consolidation",
    title: "Consolidated Dashboard",
    description: "See group-level health across revenue, cash, collections, setup, and module adoption without leaving the Companies area.",
    checklist: ["Track cross-company operating signals", "Compare setup health", "Spot entities needing attention"],
  },
  reports: {
    eyebrow: "Reporting",
    title: "Consolidated Reports",
    description: "Prepare multi-company packs for finance, compliance, management reviews, and stakeholder reporting.",
    checklist: ["Select reporting scope", "Review currency context", "Export audit-ready report packs"],
  },
  billing: {
    eyebrow: "Subscription",
    title: "Billing & Usage",
    description: "Monitor plan status, billing workspace ownership, seats, and multi-company usage from one place.",
    checklist: ["Review billing workspace", "Check plan and renewal status", "Track module entitlement usage"],
  },
  settings: {
    eyebrow: "Controls",
    title: "Settings",
    description: "Configure group naming, defaults, governance controls, and consolidation preferences.",
    checklist: ["Maintain group identity", "Set defaults for new companies", "Document consolidation governance"],
  },
};

type CompaniesPageTemplateProps = {
  pageKey: CompaniesPageKey;
};

export function CompaniesPageTemplate({ pageKey }: CompaniesPageTemplateProps) {
  const details = pageDetails[pageKey];
  const activeItem = companiesNavItems.find((item) => item.key === pageKey) ?? companiesNavItems[0];
  const ActiveIcon = activeItem.icon;

  return (
    <DashboardPageShell
      title={details.title}
      description={details.description}
      icon={<ActiveIcon className="h-6 w-6" />}
      maxWidthClassName="max-w-7xl"
      primaryAction={
        details.primaryAction ? (
          <Button asChild>
            <Link href={details.primaryAction.href}>{details.primaryAction.label}</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-orange-500" />
              Companies
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {companiesNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === pageKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "group rounded-2xl border px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                    active
                      ? "border-orange-300 bg-orange-50 text-orange-950 shadow-sm dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-100"
                      : "border-border/70 bg-background/60 text-foreground hover:border-orange-200 hover:bg-orange-50/60 dark:bg-zinc-950/20 dark:hover:border-orange-900/60 dark:hover:bg-orange-950/20",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn(
                      "mt-0.5 rounded-xl border p-2 transition",
                      active
                        ? "border-orange-200 bg-white text-orange-600 dark:border-orange-900/70 dark:bg-orange-950/50 dark:text-orange-300"
                        : "border-border bg-card text-muted-foreground group-hover:text-orange-600 dark:group-hover:text-orange-300",
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{item.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="overflow-hidden border-border/70 bg-card shadow-sm">
            <CardHeader className="border-b border-border/60 bg-gradient-to-br from-orange-50 via-background to-amber-50 dark:from-orange-950/30 dark:via-zinc-950 dark:to-amber-950/20">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="w-fit">{details.eyebrow}</Badge>
                <Badge className="w-fit bg-emerald-600 text-white hover:bg-emerald-600">MULTI_COMPANY enabled</Badge>
              </div>
              <CardTitle className="mt-3 flex items-center gap-3 text-2xl">
                <span className="rounded-2xl bg-orange-600 p-2 text-white shadow-sm shadow-orange-900/20">
                  <ActiveIcon className="h-5 w-5" />
                </span>
                {details.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>{details.description}</p>
                <p>
                  This area is protected by the <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">MULTI_COMPANY</code> module and is hidden from single-company accounts in navigation and route access.
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/40 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Production checklist
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {details.checklist.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-orange-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Context-aware</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Uses the active company context from the sidebar switcher before showing group workflows.</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Access-safe</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Separates all-company access from selected-company access and highlights archived companies.</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm">Localization-ready</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Country, currency, setup, and module metadata are carried in the shared company context.</CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardPageShell>
  );
}
