"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE, type PayrollIssue } from "./shared";

const ICON = { error: CircleAlert, warning: TriangleAlert, info: Info } as const;

/** Groups pre-flight findings by what they are, so ten people missing a PAN read as one line with names, not ten. */
export function IssueList({ issues, limit = 3 }: { issues: PayrollIssue[]; limit?: number }) {
  const t = useTranslations("PayrollHub");
  const groups = useMemo(() => {
    const m = new Map<string, { code: string; severity: PayrollIssue["severity"]; names: string[]; params?: PayrollIssue["params"] }>();
    for (const i of issues) {
      const g = m.get(i.code) ?? { code: i.code, severity: i.severity, names: [], params: i.params };
      if (i.name) g.names.push(i.name);
      m.set(i.code, g);
    }
    const order = { error: 0, warning: 1, info: 2 } as const;
    return [...m.values()].sort((a, b) => order[a.severity] - order[b.severity]);
  }, [issues]);

  if (groups.length === 0) return null;
  return (
    <ul className="space-y-2">
      {groups.map((g) => {
        const Icon = ICON[g.severity];
        const shown = g.names.slice(0, limit).join(", ");
        const more = g.names.length - limit;
        return (
          <li key={g.code} className={cn("flex gap-3 rounded-xl border p-3 text-sm", SEVERITY_TONE[g.severity])}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{t(`issue.${g.code}.title`, { count: Math.max(1, g.names.length), ...(g.params ?? {}) })}</p>
              <p className="text-xs opacity-90">{t(`issue.${g.code}.body`)}</p>
              {shown ? <p className="mt-1 text-xs opacity-80">{shown}{more > 0 ? ` ${t("issue.more", { count: more })}` : ""}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
