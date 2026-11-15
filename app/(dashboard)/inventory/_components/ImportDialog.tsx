"use client";

import { useRef, useState } from "react";
import { Download, FileUp, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "./shared";

type Result = { dryRun: boolean; create: number; update: number; errors: { row: number; sku: string; message: string }[] };

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF, optional BOM. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x !== "")) rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("InventoryHub");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => { setRows(null); setResult(null); setFileName(""); };
  const run = async (data: Record<string, string>[], dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await api<Result>("/api/inventory/import", { method: "POST", body: JSON.stringify({ rows: data, dryRun }) });
      setResult(r);
      if (!dryRun) { toast.success(t("import.done", { created: r.create, updated: r.update })); onDone(); reset(); onClose(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("import.failed"));
    } finally {
      setBusy(false);
    }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error(t("import.tooBig")); return; }
    const data = parseCsv(await f.text());
    if (data.length === 0) { toast.error(t("import.empty")); return; }
    setFileName(f.name); setRows(data); void run(data, true);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("import.title")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("import.intro")}</p>
        <Button asChild variant="outline" size="sm" className="w-fit gap-1.5"><a href="/api/inventory/export?type=template"><Download className="h-4 w-4" />{t("import.template")}</a></Button>
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/50">
          <FileUp className="h-6 w-6" />{fileName || t("import.choose")}
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        {busy && !result ? <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div> : null}
        {result ? (
          <div className="space-y-2 rounded-xl border p-3 text-sm">
            <p className="font-medium">{t("import.summary", { created: result.create, updated: result.update })}</p>
            {result.errors.length > 0 ? (
              <div><p className="text-rose-600">{t("import.problems", { count: result.errors.length })}</p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">{result.errors.slice(0, 20).map((e) => <li key={`${e.row}-${e.sku}`}>{t("import.row", { row: e.row })}{e.sku ? ` (${e.sku})` : ""}: {e.message}</li>)}</ul></div>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { reset(); onClose(); }}>{t("cancel")}</Button>
          <Button disabled={!rows || !result || busy || result.create + result.update === 0} onClick={() => rows && void run(rows, false)}>{busy && result ? <Loader2 className="h-4 w-4 animate-spin" /> : t("import.confirm", { count: result ? result.create + result.update : 0 })}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
