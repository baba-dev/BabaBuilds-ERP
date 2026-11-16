"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FileImage, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileInfo = { originalName: string; mimeType: string; size: number; publicUrl: string; importedDocumentId?: string };
const CLASSES = ["EXPENSE", "VENDOR_BILL", "CLIENT", "PROPOSAL", "GENERAL"] as const;
const defaultClass = (f: FileInfo) => (f.mimeType === "application/pdf" ? "VENDOR_BILL" : "EXPENSE");
const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function SharedImportClient({ shareId, title, text, sourceUrl, receivedAt, files }: { shareId: string; title: string | null; text: string | null; sourceUrl: string | null; receivedAt: string; files: FileInfo[] }) {
  const t = useTranslations("InboxImport");
  const router = useRouter();
  const [choice, setChoice] = useState<Record<number, string>>(() => Object.fromEntries(files.map((f, i) => [i, defaultClass(f)])));
  const [done, setDone] = useState<Record<number, string>>(() => Object.fromEntries(files.flatMap((f, i) => (f.importedDocumentId ? [[i, f.importedDocumentId]] : []))));
  const [busy, setBusy] = useState<number | "discard" | null>(null);

  async function add(index: number) {
    setBusy(index);
    try {
      const res = await fetch("/api/inbox/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareId, index, classification: choice[index] }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; documentId?: string };
      if (!res.ok && res.status !== 409) { toast.error(j.error ?? t("error")); return; }
      if (j.documentId) { setDone((d) => ({ ...d, [index]: j.documentId! })); toast.success(t("added")); }
    } finally { setBusy(null); }
  }
  async function discard() {
    setBusy("discard");
    try {
      const res = await fetch("/api/inbox/import", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareId }) });
      if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; toast.error(j.error ?? t("error")); return; }
      toast.success(t("discarded")); router.replace("/inbox/import");
    } finally { setBusy(null); }
  }

  const card = "rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm";
  return (
    <div className="space-y-6">
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black">{title || t("untitled")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("received", { date: new Date(receivedAt).toLocaleString() })} · {t("files", { count: files.length })}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={busy === "discard"} onClick={() => void discard()} className="text-rose-600"><Trash2 className="me-1.5 h-4 w-4" />{t("discard")}</Button>
        </div>
        {text && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>}
        {sourceUrl && <p className="mt-2 text-sm">{t("source")}: <a className="text-indigo-600 hover:underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">{sourceUrl}</a></p>}
        {files.length === 0 && <p className="mt-3 text-sm text-muted-foreground">{t("noFiles")}</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {files.map((f, i) => {
          const Icon = f.mimeType === "application/pdf" ? FileText : FileImage;
          const docId = done[i];
          return (
            <article key={`${f.publicUrl}-${i}`} className={cn(card, docId && "border-emerald-500/40")}>
              <header className="flex items-start gap-3">
                <span className="rounded-xl bg-muted p-2.5"><Icon className="h-5 w-5 text-muted-foreground" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-bold">{f.originalName}</p><p className="text-xs text-muted-foreground">{f.mimeType} · {size(f.size)}</p></div>
              </header>
              {docId ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />{t("added")}</p>
              ) : (
                <label className="mt-4 block text-xs font-semibold">{t("classification")}
                  <select value={choice[i]} onChange={(e) => setChoice({ ...choice, [i]: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm">
                    {CLASSES.map((c) => <option key={c} value={c}>{t(`class.${c}`)}</option>)}
                  </select>
                </label>
              )}
              <footer className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><a href={f.publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="me-1.5 h-3.5 w-3.5" />{t("preview")}</a></Button>
                {docId ? <Button asChild size="sm"><Link href="/documents">{t("openDoc")}</Link></Button> : <Button size="sm" disabled={busy === i} onClick={() => void add(i)}>{busy === i ? t("adding") : t("add")}</Button>}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
