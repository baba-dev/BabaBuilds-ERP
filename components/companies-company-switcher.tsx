"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Circle, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Company = {
  id: string;
  name: string;
  baseCurrency: string;
  countryCode: string;
  isSetupComplete: boolean;
  isArchived?: boolean;
  enabledModules?: string[];
  accessSources: string[];
};

type CompanyContext = {
  activeWorkspace: Company | null;
  group: { name: string } | null;
  accessibleCompanies: Company[];
  multiCompanyEnabled: boolean;
};

const accessLabel = (sources: string[]) => {
  if (sources.includes("COMPANY_GROUP_ALL_COMPANIES")) return "All access";
  if (sources.includes("COMPANY_GROUP_SELECTED_COMPANIES")) return "Selected";
  return "Direct";
};

export function CompanySwitcher() {
  const { open, isMobile } = useSidebar();
  const { update } = useSession();
  const isExpanded = open || isMobile;
  const [context, setContext] = useState<CompanyContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company-context", { cache: "no-store" });
      if (!res.ok) return;
      setContext((await res.json()) as CompanyContext);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companies = useMemo(() => context?.accessibleCompanies ?? [], [context]);
  const activeCompany = context?.activeWorkspace ?? companies[0] ?? null;

  if (loading || !context?.multiCompanyEnabled || !activeCompany) return null;

  const onSwitch = async (workspaceId: string) => {
    if (workspaceId === activeCompany.id) return;
    const target = companies.find((company) => company.id === workspaceId);
    if (target?.isArchived) {
      toast.error("Archived companies cannot be selected until restored.");
      return;
    }

    setSwitchingId(workspaceId);
    try {
      const res = await fetch("/api/company-context/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Unable to switch company.");
      }
      await update({ workspaceId });
      try {
        sessionStorage.setItem("bababuilds:last-company-switch", JSON.stringify({
          workspaceId,
          name: target?.name ?? "company",
          switchedAt: Date.now(),
        }));
      } catch {
        // Non-fatal: confirmation warnings still work without sessionStorage.
      }
      toast.success(`Switched to ${target?.name ?? "company"}.`);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to switch company.");
      setSwitchingId(null);
    }
  };

  if (!isExpanded) {
    return (
      <div className="px-2">
        <div className="flex justify-center rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-2 text-zinc-200" title={`${context.group?.name ?? "Company group"}: ${activeCompany.name}`}>
          <Building2 className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 rounded-2xl border border-zinc-800/60 bg-zinc-950/60 p-3 text-zinc-100 shadow-inner shadow-black/20">
      <div className="mb-2 flex items-start gap-2">
        <Building2 className="mt-0.5 h-4 w-4 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold uppercase tracking-wider text-zinc-400">{context.group?.name ?? "Company group"}</p>
          <p className="truncate text-sm font-bold text-white">{activeCompany.name}</p>
        </div>
        {switchingId && <RefreshCw className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
      </div>

      <Select value={activeCompany.id} onValueChange={onSwitch} disabled={Boolean(switchingId)}>
        <SelectTrigger className="h-auto min-h-10 border-zinc-800 bg-zinc-900/80 text-left text-zinc-100">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent className="max-h-96 min-w-[320px]">
          {companies.map((company) => (
            <SelectItem key={company.id} value={company.id} disabled={company.isArchived} className="py-2">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{company.name}</span>
                  {company.id === activeCompany.id && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  {company.isArchived && <Lock className="h-3.5 w-3.5 text-zinc-400" />}
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <Badge variant="secondary">{company.countryCode}</Badge>
                  <Badge variant="secondary">{company.baseCurrency}</Badge>
                  <Badge className={cn(company.isSetupComplete ? "bg-emerald-600" : "bg-amber-600")}>
                    {company.isSetupComplete ? "Setup done" : "Setup pending"}
                  </Badge>
                  <Badge variant="outline">{accessLabel(company.accessSources)}</Badge>
                  {company.isArchived && <Badge variant="destructive">Archived</Badge>}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <Circle className="h-2 w-2 fill-current" />
                  {(company.enabledModules?.length ? company.enabledModules : ["Core"]).slice(0, 4).join(", ")}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
