"use client";

/** Fetch + draw page 1 of a preview PDF onto a canvas. Shared by the tiles and the full-screen viewer. */
type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjs: Promise<PdfJs> | null = null;

/**
 * pdf.js is loaded as a plain browser module from /pdfjs (copied from node_modules by scripts/copy-pdfjs.mjs), not
 * through the bundler: bundling its ES build breaks under webpack and costs build time on the VPS. The import is
 * dynamic, so it only downloads when this page is opened.
 */
const loadPdfJs = (): Promise<PdfJs> => {
  const entry: string = "/pdfjs/pdf.min.mjs"; // a variable keeps TypeScript from resolving it as a module
  pdfjs ??= (import(/* webpackIgnore: true */ entry) as Promise<PdfJs>).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return lib;
  });
  return pdfjs;
};

// Never hammer the server: at most three previews in flight from this page.
let inFlight = 0;
const queue: Array<() => void> = [];
const acquire = () => (inFlight < 3 ? (inFlight += 1, Promise.resolve()) : new Promise<void>((r) => queue.push(r)));
const release = () => { const next = queue.shift(); if (next) next(); else inFlight -= 1; };

export class PreviewError extends Error {
  constructor(public status: number) { super(`preview ${status}`); }
}

/** `urgent` (the full-screen viewer) skips the tile queue so the page the person is looking at is never stuck behind thumbnails. */
export async function renderPreview(url: string, canvas: HTMLCanvasElement, cssWidth: number, signal: AbortSignal, urgent = false): Promise<{ aspect: number; sample: boolean }> {
  if (!urgent) await acquire();
  try {
    const res = await fetch(url, { signal, credentials: "same-origin" });
    if (!res.ok) throw new PreviewError(res.status);
    const sample = res.headers.get("X-Preview-Sample") === "1";
    const data = new Uint8Array(await res.arrayBuffer());
    const lib = await loadPdfJs();
    const doc = await lib.getDocument({ data }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${(cssWidth * base.height) / base.width}px`;
      const task = page.render({ canvas, viewport });
      signal.addEventListener("abort", () => task.cancel(), { once: true });
      await task.promise;
      return { aspect: base.width / base.height, sample };
    } finally {
      void doc.destroy();
    }
  } finally {
    if (!urgent) release();
  }
}

export function previewUrl(args: { design: string; invoiceId: string | null; accent: string | null; tds: { rate: number; section: string } | null; download?: boolean }): string {
  const q = new URLSearchParams({ design: args.design });
  if (args.invoiceId) q.set("invoiceId", args.invoiceId);
  if (args.accent) q.set("accent", args.accent);
  if (args.tds) { q.set("tds", String(args.tds.rate)); q.set("tdsSection", args.tds.section); }
  if (args.download) q.set("download", "1");
  return `/api/invoice-designs/preview?${q.toString()}`;
}
