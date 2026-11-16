"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GitMerge, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { api } from "./shared";

type Dup = { id: string; name: string; email: string | null; invoices: number; proposals: number; retainers: number };

export function DuplicatesDialog({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (v: boolean) => void; onChanged: () => void }) {
  const t = useTranslations("ClientsCrm");
  const [groups, setGroups] = useState<Array<{ clients: Dup[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ groups: Array<{ clients: Dup[] }> }>("/api/clients/duplicates");
    setGroups(r.data.groups ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  async function merge(sourceId: string, targetId: string) {
    setMerging(sourceId);
    const r = await api("/api/clients/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, targetId }) });
    setMerging(null);
    if (!r.ok) { toast.error(r.data.error ?? t("toast.failed")); return; }
    toast.success(t("toast.merged"));
    onChanged();
    void load();
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t("dup.title")} description={t("dup.description")} desktopClassName="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
      <div className="space-y-4">
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("dup.loading")}</p>}
        {!loading && groups.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("dup.none")}</p>}
        {groups.map((g, i) => {
          const keep = g.clients[0];
          return (
            <div key={keep.id + i} className="rounded-xl border p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("dup.keep", { name: keep.name })}</p>
              <ul className="space-y-2">
                {g.clients.map((c, idx) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0"><span className="font-medium">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{c.email ?? t("noEmail")} · {t("dup.counts", { invoices: c.invoices, proposals: c.proposals, retainers: c.retainers })}</span></span>
                    {idx === 0 ? <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">{t("dup.kept")}</span> : (
                      <Button size="sm" variant="outline" disabled={merging !== null} onClick={() => void merge(c.id, keep.id)}>
                        {merging === c.id ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden /> : <GitMerge className="mr-1.5 size-4" aria-hidden />}{t("dup.merge")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </ResponsiveDialog>
  );
}
