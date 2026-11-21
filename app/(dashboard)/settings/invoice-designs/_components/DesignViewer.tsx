"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Minus, Plus, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { renderPreview } from "./pdf-render";

const ZOOMS = [1, 1.5, 2, 3] as const;

/** Full-screen look at one design: zoom, previous/next, and "Use this design". Escape closes; focus stays inside. */
export function DesignViewer({ design, index, total, url, downloadUrl, thin, current, canManage, saving, onPrev, onNext, onUse, onClose }: {
  design: string; index: number; total: number; url: string; downloadUrl: string; thin: boolean; current: boolean; canManage: boolean; saving: boolean;
  onPrev: () => void; onNext: () => void; onUse: () => void; onClose: () => void;
}) {
  const t = useTranslations("InvoiceCompare");
  const th = useTranslations("SettingsHub.invoicing");
  // The dialog mounts its content through a portal after this component's first effect, so hold the nodes in state.
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!host || !canvas) return;
    const ctl = new AbortController();
    const fit = Math.max(host.clientWidth - 24, 200);
    const base = thin ? Math.min(fit, 360) : Math.min(fit, 820);
    queueMicrotask(() => { if (!ctl.signal.aborted) setStatus("loading"); });
    renderPreview(url, canvas, Math.round(base * ZOOMS[zoom]), ctl.signal, true)
      .then(() => { if (!ctl.signal.aborted) { setStatus("ready"); setPainted(true); } })
      .catch((e: unknown) => { if (!ctl.signal.aborted && !(e instanceof DOMException && e.name === "AbortError")) setStatus("error"); });
    return () => ctl.abort();
  }, [host, canvas, url, thin, zoom, attempt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  const name = th(`design.${design}`);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton className="top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 pt-safe pb-safe sm:max-w-none sm:rounded-none sm:p-0">
        <div className="flex items-center gap-2 border-b border-border/70 py-2.5 ps-3 pe-14 sm:ps-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">{name}</DialogTitle>
            <DialogDescription className="truncate text-xs">{th(`designHint.${design}`)} · {t("position", { index: index + 1, total })}</DialogDescription>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label={t("zoom")}>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0} aria-label={t("zoomOut")} className="pointer-coarse:size-11"><Minus aria-hidden /></Button>
            <span className="w-11 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">{Math.round(ZOOMS[zoom] * 100)}%</span>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoom === ZOOMS.length - 1} aria-label={t("zoomIn")} className="pointer-coarse:size-11"><Plus aria-hidden /></Button>
          </div>
        </div>

        <div ref={setHost} className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-zinc-100 p-3 dark:bg-zinc-900 sm:p-6">
          <div className={cn("mx-auto w-fit", !painted && "invisible", status === "loading" && "opacity-60 transition-opacity")}>
            <canvas ref={setCanvas} aria-label={t("canvasLabel", { design: name })} role="img" className="max-w-none bg-white shadow-lg" />
          </div>
          {status === "loading" ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status"><Loader2 className="size-6 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden /><span className="sr-only">{t("rendering")}</span></div> : null}
          {status === "error" ? <div className="absolute inset-0 flex items-center justify-center"><Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}><RotateCw aria-hidden />{t("retry")}</Button></div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-background px-3 py-3 sm:px-5">
          <Button type="button" variant="outline" size="icon" onClick={onPrev} aria-label={t("prev")} className="pointer-coarse:size-11"><ChevronLeft aria-hidden /></Button>
          <Button type="button" variant="outline" size="icon" onClick={onNext} aria-label={t("next")} className="pointer-coarse:size-11"><ChevronRight aria-hidden /></Button>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="pointer-coarse:h-11"><a href={downloadUrl} download><Download aria-hidden />{t("download")}</a></Button>
            {canManage ? (
              <Button type="button" onClick={onUse} disabled={current || saving} className="pointer-coarse:h-11">
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                {current ? t("usingThis") : t("useDesign")}
              </Button>
            ) : <p className="text-xs text-muted-foreground">{t("noPermission")}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
