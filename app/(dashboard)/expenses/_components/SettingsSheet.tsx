"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { api, type BudgetLine, type ExpenseSettings } from "./shared";

/** Rules for approvers: who needs approval, the forwarding inbox and monthly caps. Needs the approve permission to save. */
export function SettingsSheet({ open, onOpenChange, currency, extraCategories, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; currency: string; extraCategories: string[]; onSaved: () => void }) {
  const t = useTranslations("ExpensesLedger");
  const tc = useTranslations("Expenses");
  const [s, setS] = useState<ExpenseSettings | null>(null);
  const [threshold, setThreshold] = useState("0");
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [savedBudgets, setSavedBudgets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api<{ data: ExpenseSettings }>("/api/expenses/settings"), api<{ data: Array<{ category: string; monthlyAmount: number }>; status: BudgetLine[] }>("/api/expenses/budgets")]);
    if (a.ok) { setS(a.data.data); setThreshold(String(a.data.data.approvalThreshold)); }
    if (b.ok) { const m = Object.fromEntries(b.data.data.map((x) => [x.category, String(x.monthlyAmount)])); setBudgets(m); setSavedBudgets(m); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    const r = await api("/api/expenses/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { toast.error(r.data.error ?? t("toast.failed")); return false; }
    await load(); onSaved(); return true;
  }
  async function setBudget(category: string) {
    const raw = (budgets[category] ?? "").replace(/,/g, "");
    if (raw === (savedBudgets[category] ?? "")) return;
    const amount = raw === "" ? null : Number(raw);
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return toast.error(t("errors.AMOUNT"));
    const r = await api("/api/expenses/budgets", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, monthlyAmount: amount }) });
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    setSavedBudgets((b) => ({ ...b, [category]: raw })); toast.success(t("settings.budgetSaved")); onSaved();
  }
  const canManage = s?.canManage ?? false;
  const cats = ["*", ...PRESET_CATEGORIES.map((c) => c.value as string), ...extraCategories];
  const label = (c: string) => (c === "*" ? t("budgets.overall") : (() => { const p = PRESET_CATEGORIES.find((x) => x.value === c); return p ? tc(`cat_${p.key}` as never) : c; })());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5"><SheetTitle>{t("settings.title")}</SheetTitle><SheetDescription>{canManage ? t("settings.description") : t("settings.readOnly")}</SheetDescription></SheetHeader>
        <div className="space-y-7 p-5">
          <section aria-label={t("settings.approvals")} className="space-y-3">
            <h3 className="text-sm font-semibold">{t("settings.approvals")}</h3>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{t("settings.requireApproval")}</p><p className="text-xs text-muted-foreground">{t("settings.requireApprovalHelp")}</p></div><Switch checked={s?.approvalRequired ?? false} disabled={!canManage || busy} onCheckedChange={(v) => void patch({ approvalRequired: v })} aria-label={t("settings.requireApproval")} /></div>
            {s?.approvalRequired && <div><Label htmlFor="s-threshold" className="mb-1.5 block text-xs text-muted-foreground">{t("settings.threshold", { currency })}</Label>
              <div className="flex gap-2"><Input id="s-threshold" inputMode="decimal" className="h-10" value={threshold} disabled={!canManage} onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ""))} /><Button variant="outline" disabled={!canManage || busy} onClick={() => void patch({ approvalThreshold: Number(threshold) || 0 }).then((ok) => ok && toast.success(t("settings.saved")))}>{t("save")}</Button></div>
              <p className="mt-1 text-xs text-muted-foreground">{t("settings.thresholdHelp")}</p></div>}
          </section>

          <section aria-label={t("settings.inbox")} className="space-y-3">
            <h3 className="text-sm font-semibold">{t("settings.inbox")}</h3>
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{t("settings.inboxOn")}</p><p className="text-xs text-muted-foreground">{t("settings.inboxHelp")}</p></div><Switch checked={s?.inboxEnabled ?? false} disabled={!canManage || busy} onCheckedChange={(v) => void patch({ inboxEnabled: v })} aria-label={t("settings.inboxOn")} /></div>
            {s?.inboxEnabled && s.inboxUrl && (
              <div className="space-y-2">
                <Label htmlFor="s-inbox" className="block text-xs text-muted-foreground">{t("settings.inboxUrl")}</Label>
                <div className="flex gap-2"><Input id="s-inbox" readOnly className="h-10 font-mono text-xs" value={s.inboxUrl} onFocus={(e) => e.currentTarget.select()} /><Button variant="outline" size="icon" aria-label={t("settings.copy")} onClick={() => { void navigator.clipboard?.writeText(s.inboxUrl ?? ""); toast.success(t("settings.copied")); }}><Copy className="size-4" aria-hidden /></Button><Button variant="outline" size="icon" aria-label={t("settings.rotate")} disabled={busy} onClick={() => void patch({ rotateInbox: true }).then((ok) => ok && toast.success(t("settings.rotated")))}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}</Button></div>
                <p className="text-xs text-muted-foreground">{t("settings.inboxHow")}</p>
              </div>)}
          </section>

          <section aria-label={t("budgets.title")} className="space-y-3">
            <h3 className="text-sm font-semibold">{t("budgets.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("budgets.help", { currency })}</p>
            <ul className="space-y-2">
              {cats.map((c) => (
                <li key={c} className="flex items-center gap-2">
                  <Label htmlFor={`b-${c}`} className="w-40 shrink-0 truncate text-sm">{label(c)}</Label>
                  <Input id={`b-${c}`} inputMode="decimal" className="h-9" placeholder={t("budgets.none")} value={budgets[c] ?? ""} disabled={!canManage} onChange={(e) => setBudgets((b) => ({ ...b, [c]: e.target.value.replace(/[^\d.,]/g, "") }))} onBlur={() => canManage && void setBudget(c)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void setBudget(c); } }} />
                </li>))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
