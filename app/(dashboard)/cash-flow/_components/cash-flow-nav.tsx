"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const tabs = [
  { key: "overview", href: "/cash-flow/overview", label: "Overview" },
  { key: "inflows", href: "/cash-flow/inflows", label: "Inflows" },
  { key: "outflows", href: "/cash-flow/outflows", label: "Outflows" },
  { key: "scenarios", href: "/cash-flow/scenarios", label: "Scenarios" },
  { key: "variance", href: "/cash-flow/variance", label: "Variance" },
  { key: "assumptions", href: "/cash-flow/assumptions", label: "Assumptions" },
  { key: "alerts", href: "/cash-flow/alerts", label: "Alerts" },
] as const;

export function CashFlowNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const qs = search.toString();

  const active =
    tabs.find((t) => (pathname ? pathname.startsWith(t.href) : false))?.key ?? "overview";

  return (
    <Tabs value={active} className="w-full">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} asChild>
            <Link href={`${t.href}${qs ? `?${qs}` : ""}`}>{t.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
