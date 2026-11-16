"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ExternalLink, FileImage, FileText, LayoutGrid, List, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { cn } from "@/lib/utils";

type Doc = {
  id: string; title: string; category: string; status: string; isArchived: boolean; createdAt: string; aiSummary: string | null;
  files: { mimeType: string; byteSize: number; storedPath: string }[];
  links: unknown[];
};
const CATEGORIES = ["EXPENSE_RECEIPT", "VENDOR_BILL", "INVOICE_ATTACHMENT", "BANK_STATEMENT", "TAX_FILING", "COMPLIANCE_DOCUMENT", "BUSINESS_REGISTRATION", "CONTRACT", "PERSONAL_USER_DOCUMENT", "GENERAL_DOCUMENT"];
const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function DocumentLibrary({ canManage, canArchive }: { canManage: boolean; canArchive: boolean }) {
  const t = useTranslations("DocumentsHub");
  const locale = useLocale();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => { const h = setTimeout(() => setQuery(q), 250); return () => clearTimeout(h); }, [q]);
  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (query) qs.set("q", query);
    if (archived) qs.set("archived", "true");
    const res = await fetch(`/api/documents/list?${qs}`);
    if (res.ok) setDocs(((await res.json()) as { documents: Doc[] }).documents);
  }, [query, archived]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and when the filters change; state is set after the awaited response
  useEffect(() => { void load(); }, [load]);

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) { toast.error(j.error ?? t("error")); return; }
    toast.success(t("updated")); setEditing(null); await load();
  }

  // Older documents may carry a free-form category or status; show it as written instead of a missing-translation key.
  const label = (group: "cat" | "status", value: string) => (t.has(`${group}.${value}`) ? t(`${group}.${value}`) : value);
  const shown = (docs ?? []).filter((d) => (!category || d.category === category) && (archived || !d.isArchived));
  const card = "rounded-2xl border border-border/70 bg-card/90 shadow-sm";

  return (
    <div className="space-y-6">
      <UploadDropzone onUploaded={() => void load()} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="h-10 w-full rounded-xl border border-input bg-transparent ps-9 pe-3 text-sm" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("allCategories")} className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm">
          <option value="">{t("allCategories")}</option>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="h-4 w-4" />{t("showArchived")}</label>
        <div className="flex rounded-lg bg-muted p-1" role="group">
          <button aria-pressed={view === "grid"} onClick={() => setView("grid")} className={cn("rounded-md px-2.5 py-1.5", view === "grid" && "bg-background shadow-sm")} aria-label={t("grid")}><LayoutGrid className="h-4 w-4" /></button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")} className={cn("rounded-md px-2.5 py-1.5", view === "list" && "bg-background shadow-sm")} aria-label={t("list")}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {docs === null ? <div className="h-40 animate-pulse rounded-2xl bg-muted/50" /> : shown.length === 0 ? (
        <p className={cn(card, "p-10 text-center text-sm text-muted-foreground")}>{t("empty")}</p>
      ) : (
        <ul className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2")}>
          {shown.map((d) => {
            const f = d.files[0];
            const Icon = f?.mimeType === "application/pdf" ? FileText : FileImage;
            return (
              <li key={d.id} className={cn(card, "p-4", d.isArchived && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <span className="rounded-xl bg-muted p-2.5"><Icon className="h-5 w-5 text-muted-foreground" /></span>
                  <div className="min-w-0 flex-1">
                    {editing?.id === d.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); void patch(d.id, { title: editing.title }); }} className="flex gap-2">
                        <input autoFocus value={editing.title} maxLength={140} onChange={(e) => setEditing({ id: d.id, title: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm" />
                        <Button type="submit" size="sm" disabled={!editing.title.trim()}>{t("save")}</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>{t("cancel")}</Button>
                      </form>
                    ) : <p className="truncate text-sm font-bold">{d.title}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">{label("cat", d.category)} · {label("status", d.status)}{f ? ` · ${size(f.byteSize)}` : ""} · {new Date(d.createdAt).toLocaleDateString(locale)}{d.isArchived ? ` · ${t("archived")}` : ""}</p>
                    {d.aiSummary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{d.aiSummary}</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f && <Button asChild size="sm" variant="outline" className="h-8 text-xs"><a href={f.storedPath} target="_blank" rel="noreferrer"><ExternalLink className="me-1.5 h-3.5 w-3.5" />{t("view")}</a></Button>}
                  {canManage && !d.isArchived && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditing({ id: d.id, title: d.title })}><Pencil className="me-1.5 h-3.5 w-3.5" />{t("rename")}</Button>}
                  {canArchive && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void patch(d.id, { archived: !d.isArchived })}>{d.isArchived ? <><ArchiveRestore className="me-1.5 h-3.5 w-3.5" />{t("restore")}</> : <><Archive className="me-1.5 h-3.5 w-3.5" />{t("archive")}</>}</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
