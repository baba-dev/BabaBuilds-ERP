"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "./CompaniesShell";

type Values = { name: string; countryCode: string; baseCurrency: string; email: string; phone: string; website: string; address: string; proprietorName: string; gstin: string; panNumber: string; relationType: string };
const EMPTY: Values = { name: "", countryCode: "IN", baseCurrency: "INR", email: "", phone: "", website: "", address: "", proprietorName: "", gstin: "", panNumber: "", relationType: "MEMBER" };
const PLACEHOLDERS = new Set(["not provided", "notprovided", "hello@example.com"]);
const clean = (v: string | null | undefined) => (v && !PLACEHOLDERS.has(v.trim().toLowerCase()) ? v : "");

/** Create a company, or edit one when `workspaceId` is given. Empty optional fields are simply left out. */
export function CompanyForm({ workspaceId }: { workspaceId?: string }) {
  const t = useTranslations("CompaniesHub");
  const router = useRouter();
  const [v, setV] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!workspaceId);

  useEffect(() => {
    if (!workspaceId) return;
    void (async () => {
      const res = await fetch("/api/companies");
      const j = (await res.json().catch(() => ({}))) as { data?: { workspaceId: string; relationType: string; workspace: { name: string; countryCode: string; baseCurrency: string; businessProfile: Record<string, string | null> | null } }[] };
      const row = j.data?.find((r) => r.workspaceId === workspaceId);
      if (row) {
        const p = row.workspace.businessProfile ?? {};
        setV({ name: row.workspace.name, countryCode: row.workspace.countryCode, baseCurrency: row.workspace.baseCurrency, relationType: row.relationType, email: clean(p.email), phone: clean(p.phone), website: clean(p.website), address: clean(p.address), proprietorName: clean(p.proprietorName), gstin: clean(p.gstin), panNumber: clean(p.panNumber) });
      }
      setLoading(false);
    })();
  }, [workspaceId]);

  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErrors({});
    try {
      const body: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) if (val.trim() !== "" || workspaceId) body[k] = val.trim();
      if (workspaceId) for (const k of ["phone", "website", "gstin", "panNumber"]) if (body[k] === "") delete body[k];
      const res = await fetch(workspaceId ? `/api/companies/${workspaceId}` : "/api/companies", { method: workspaceId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string[]> };
      if (!res.ok) { setErrors(j.fields ?? {}); toast.error(j.error ?? t("error")); return; }
      toast.success(workspaceId ? t("form.saved") : t("form.created"));
      router.push("/companies");
    } finally { setBusy(false); }
  }

  const field = (k: keyof Values, label: string, type = "text", span = false) => (
    <label className={cn("block text-xs font-semibold", span && "sm:col-span-2")}>{label}
      <input type={type} className={inputClass} value={v[k]} onChange={set(k)} aria-invalid={!!errors[k]} />
      {errors[k] && <span className="text-[11px] font-normal text-rose-600">{errors[k]![0]}</span>}
    </label>
  );
  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />;

  return (
    <form onSubmit={(e) => void submit(e)} className={cn(cardClass, "max-w-3xl space-y-4 p-5")}>
      <h2 className="text-base font-black">{workspaceId ? t("form.editTitle") : t("form.createTitle")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", t("form.name"), "text", true)}
        {field("countryCode", t("form.country"))}{field("baseCurrency", t("form.currency"))}
        {field("email", t("form.email"), "email")}{field("phone", t("form.phone"), "tel")}
        {field("address", t("form.address"), "text", true)}
        {field("proprietorName", t("form.proprietor"))}{field("website", t("form.website"))}
        {field("panNumber", t("form.pan"))}{field("gstin", t("form.gstin"))}
        <label className="block text-xs font-semibold">{t("form.relationLabel")}
          <select className={inputClass} value={v.relationType} onChange={set("relationType")}>
            {["MEMBER", "SUBSIDIARY", "BRANCH", "AFFILIATE"].map((r) => <option key={r} value={r}>{t(`form.relation.${r}`)}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("form.optionalHint")}</p>
      <Button type="submit" disabled={busy || !v.name.trim()} className="h-10 bg-orange-600 text-white hover:bg-orange-500">{workspaceId ? t("form.save") : t("form.create")}</Button>
    </form>
  );
}
