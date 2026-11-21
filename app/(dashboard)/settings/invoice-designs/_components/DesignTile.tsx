"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderPreview } from "./pdf-render";

type Status = "idle" | "loading" | "ready" | "error";

/** One design, rendered lazily as its page-1 thumbnail. A button, so it is focusable and opens the full-screen view. */
export function DesignTile({ design, url, thin, current, onOpen, onSample }: { design: string; url: string; thin: boolean; current: boolean; onOpen: () => void; onSample: (sample: boolean) => void }) {
  const t = useTranslations("InvoiceCompare");
  const th = useTranslations("SettingsHub.invoicing");
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [attempt, setAttempt] = useState(0);
  const onSampleRef = useRef(onSample);
  useEffect(() => { onSampleRef.current = onSample; });

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current || !frame.current) return;
    const ctl = new AbortController();
    const width = Math.round(frame.current.clientWidth * (thin ? 0.52 : 1));
    // Show progress through a microtask so the effect body never sets state synchronously.
    queueMicrotask(() => { if (!ctl.signal.aborted) setStatus("loading"); });
    renderPreview(url, canvas.current, Math.max(width, 120), ctl.signal)
      .then((r) => { if (!ctl.signal.aborted) { setStatus("ready"); onSampleRef.current(r.sample); } })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        setStatus("error");
      });
    return () => ctl.abort();
  }, [visible, url, thin, attempt]);

  return (
    <div className="group relative">
      <button type="button" onClick={onOpen} aria-label={t("open", { design: th(`design.${design}`) })}
        className={cn("block w-full overflow-hidden rounded-2xl border bg-muted/40 text-start shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:-translate-y-0.5 hover:shadow-md",
          current ? "border-indigo-500 ring-1 ring-indigo-500" : "border-border/70")}>
        <div ref={frame} className="relative flex aspect-[210/297] w-full items-start justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          <canvas ref={canvas} aria-hidden className={cn("max-w-full bg-white shadow-sm transition-opacity duration-300", status === "ready" ? "opacity-100" : "opacity-0", thin && "mt-3")} />
          {status !== "ready" && status !== "error" ? <div aria-hidden className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-200/70 via-zinc-100 to-zinc-200/70 motion-reduce:animate-none dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-800" /> : null}
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{th(`design.${design}`)}</p>
            <p className="truncate text-xs text-muted-foreground">{th(`designHint.${design}`)}</p>
          </div>
          {current ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"><CheckCircle2 className="size-3" aria-hidden />{t("current")}</span> : null}
        </div>
      </button>
      {status === "error" ? (
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="absolute inset-x-3 top-[35%] flex items-center justify-center gap-2 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs font-medium shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11">
          <RotateCw className="size-3.5" aria-hidden />{t("retry")}
        </button>
      ) : null}
    </div>
  );
}
