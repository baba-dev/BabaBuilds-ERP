import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Cell, Col, ReportResult } from '@/lib/reporting/types';

export type PdfInput = {
  title: string; company: { name: string; address?: string | null; taxId?: string | null; taxIdLabel?: string | null };
  periodLabel: string; result: ReportResult; labels: Record<string, string>; footer?: string;
};

/** The built-in PDF fonts only cover Latin text, so anything else becomes "?" rather than breaking the file. Currency is written as its code (INR 1,200.00). */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?');
const money = (v: number, cur: string) => `${cur} ${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmt(c: Col, v: Cell, cur: string): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'number') return c.format === 'currency' ? money(v, cur) : c.format === 'percent' ? `${v}%` : v.toLocaleString('en-IN');
  return c.format === 'date' ? v.slice(0, 10) : v;
}

/** A clean, branded, paginated PDF of a report: company header, key figures, the table with totals, notes and page numbers. */
export async function buildReportPdf(input: PdfInput): Promise<Uint8Array> {
  const { result, labels } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const landscape = result.columns.length > 5;
  const W = landscape ? 841.89 : 595.28, H = landscape ? 595.28 : 841.89, M = 36;
  const ink = rgb(0.1, 0.1, 0.12), muted = rgb(0.42, 0.44, 0.5), line = rgb(0.88, 0.89, 0.91), band = rgb(0.96, 0.96, 0.98), accent = rgb(0.31, 0.27, 0.9);
  const cols = result.columns;
  // First column gets twice the width of the others; numbers are right-aligned.
  const weights = cols.map((_, i) => (i === 0 ? 2 : 1)), wSum = weights.reduce((a, b) => a + b, 0), usable = W - M * 2;
  const widths = weights.map((w) => (w / wSum) * usable);
  const pages: PDFPage[] = [];
  let page!: PDFPage, y = 0;

  const text = (p: PDFPage, s: string, x: number, yy: number, size: number, f: PDFFont, color = ink, align: 'l' | 'r' = 'l', maxW?: number) => {
    let t = safe(s);
    if (maxW && f.widthOfTextAtSize(t, size) > maxW) { while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > maxW) t = t.slice(0, -1); t += '...'; }
    const w = f.widthOfTextAtSize(t, size);
    p.drawText(t, { x: align === 'r' ? x - w : x, y: yy, size, font: f, color });
  };
  const newPage = (first: boolean) => {
    page = doc.addPage([W, H]); pages.push(page); y = H - M;
    if (first) {
      page.drawRectangle({ x: 0, y: H - 74, width: W, height: 74, color: band });
      text(page, input.company.name, M, H - 34, 15, bold);
      const sub = [input.company.address, input.company.taxId ? `${input.company.taxIdLabel ?? 'Tax ID'}: ${input.company.taxId}` : null].filter(Boolean).join('  |  ');
      if (sub) text(page, sub, M, H - 50, 8, font, muted, 'l', usable * 0.62);
      text(page, input.title, W - M, H - 34, 14, bold, accent, 'r');
      text(page, input.periodLabel, W - M, H - 50, 9, font, muted, 'r');
      y = H - 96;
    } else y = H - M - 8;
  };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: usable, height: 20, color: band });
    let x = M; cols.forEach((c, i) => { const right = c.format !== 'text' && c.format !== 'date'; text(page, labels[c.key] ?? c.key, right ? x + widths[i]! - 6 : x + 6, y, 8, bold, muted, right ? 'r' : 'l', widths[i]! - 12); x += widths[i]!; });
    y -= 22;
  };

  newPage(true);
  // Key figures.
  const kpis = result.kpis.slice(0, 4);
  if (kpis.length) {
    const bw = (usable - (kpis.length - 1) * 8) / kpis.length;
    kpis.forEach((k, i) => {
      const x = M + i * (bw + 8);
      page.drawRectangle({ x, y: y - 40, width: bw, height: 44, borderColor: line, borderWidth: 1 });
      text(page, labels[k.key] ?? k.key, x + 8, y - 12, 7.5, font, muted, 'l', bw - 16);
      text(page, k.format === 'currency' ? money(k.value, result.currency) : k.format === 'percent' ? `${k.value}%` : k.value.toLocaleString('en-IN'), x + 8, y - 30, 12, bold, ink, 'l', bw - 16);
    });
    y -= 62;
  }
  header();
  const rowH = 17;
  const drawRow = (r: Record<string, Cell>, strong = false, shade = false) => {
    if (y < M + 30) { newPage(false); header(); }
    if (shade) page.drawRectangle({ x: M, y: y - 5, width: usable, height: rowH, color: rgb(0.985, 0.985, 0.99) });
    let x = M;
    cols.forEach((c, i) => { const right = c.format !== 'text' && c.format !== 'date'; text(page, fmt(c, r[c.key] ?? null, result.currency), right ? x + widths[i]! - 6 : x + 6, y, 8.5, strong ? bold : font, ink, right ? 'r' : 'l', widths[i]! - 12); x += widths[i]!; });
    page.drawLine({ start: { x: M, y: y - 6 }, end: { x: M + usable, y: y - 6 }, thickness: 0.4, color: line });
    y -= rowH;
  };
  const maxRows = 600;
  result.rows.slice(0, maxRows).forEach((r, i) => drawRow(r, false, i % 2 === 1));
  if (result.rows.length > maxRows) { if (y < M + 30) { newPage(false); } text(page, `+ ${result.rows.length - maxRows} more rows (see the Excel or CSV export)`, M, y, 8, font, muted); y -= rowH; }
  if (result.totals) drawRow(Object.fromEntries(cols.map((c, i) => [c.key, i === 0 ? (labels.total ?? 'Total') : (result.totals![c.key] ?? null)])), true);
  if (result.notes.length) {
    y -= 6;
    for (const n of result.notes) { if (y < M + 20) newPage(false); text(page, labels[`note.${n}`] ?? n, M, y, 7.5, font, muted, 'l', usable); y -= 11; }
  }
  const stamp = `${input.footer ?? 'BabaBuilds ERP'}  |  ${new Date(result.generatedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  pages.forEach((p, i) => { text(p, stamp, M, 20, 7, font, muted); text(p, `${i + 1} / ${pages.length}`, W - M, 20, 7, font, muted, 'r'); });
  return doc.save();
}
