import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?');
const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PoPdfInput = {
  company: { name: string; address?: string | null; gstin?: string | null };
  po: { poNumber: string; status: string; supplier: string; supplierGstin: string | null; createdAt: Date; expectedDate: Date | null; paymentTermsDays: number | null; notes: string | null };
  lines: { name: string; sku: string; unit: string; quantity: number; received: number; unitPrice: number; gstRate: number | null }[];
};

/** A purchase order as an A4 PDF to send to the supplier. Labels are English and the built-in fonts are Latin only. */
export async function buildPoPdf(input: PoPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ink = rgb(0.1, 0.1, 0.12), muted = rgb(0.42, 0.44, 0.5), rule = rgb(0.88, 0.89, 0.91), band = rgb(0.96, 0.96, 0.98), accent = rgb(0.31, 0.27, 0.9);
  let page = doc.addPage([W, H]);
  const text = (s: string, x: number, y: number, size = 10, f = font, color = ink, right = false) => {
    const t = safe(s);
    page.drawText(t, { x: right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color });
  };
  const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '-');

  page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: band });
  text(input.company.name, M, H - 40, 16, bold);
  if (input.company.address) text(input.company.address.split('\n')[0]!.slice(0, 90), M, H - 58, 8.5, font, muted);
  if (input.company.gstin) text(`GSTIN ${input.company.gstin}`, M, H - 72, 8.5, font, muted);
  text('PURCHASE ORDER', W - M, H - 40, 15, bold, accent, true);
  text(input.po.poNumber, W - M, H - 58, 10, font, muted, true);

  let y = H - 118;
  const info: [string, string][] = [
    ['Supplier', input.po.supplier], ['Supplier GSTIN', input.po.supplierGstin ?? '-'],
    ['Order date', date(input.po.createdAt)], ['Expected on', date(input.po.expectedDate)],
    ['Payment terms', input.po.paymentTermsDays ? `${input.po.paymentTermsDays} days` : 'On delivery'], ['Status', input.po.status],
  ];
  info.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? M : W / 2 + 10;
    if (i % 2 === 0 && i > 0) y -= 18;
    text(k, x, y, 8.5, font, muted);
    text(v, x + 88, y, 10, bold);
  });
  y -= 34;

  const cols = { item: M, qty: 330, rate: 410, gst: 450, amt: W - M };
  const header = () => {
    page.drawRectangle({ x: M - 4, y: y - 6, width: W - 2 * M + 8, height: 22, color: band });
    text('Item', cols.item, y, 9, bold, muted); text('Qty', cols.qty, y, 9, bold, muted, true); text('Rate', cols.rate, y, 9, bold, muted, true); text('GST %', cols.gst + 20, y, 9, bold, muted, true); text('Amount', cols.amt, y, 9, bold, muted, true);
    y -= 24;
  };
  header();
  let net = 0, tax = 0;
  for (const l of input.lines) {
    if (y < 120) { page = doc.addPage([W, H]); y = H - 60; header(); }
    const amount = l.quantity * l.unitPrice;
    net += amount; tax += amount * ((l.gstRate ?? 0) / 100);
    text(l.name.slice(0, 46), cols.item, y, 10); text(`${l.sku}${l.received ? `  (${l.received} received)` : ''}`, cols.item, y - 11, 7.5, font, muted);
    text(`${l.quantity} ${l.unit}`, cols.qty, y, 10, font, ink, true); text(money(l.unitPrice), cols.rate, y, 10, font, ink, true);
    text(l.gstRate != null ? String(l.gstRate) : '-', cols.gst + 20, y, 10, font, ink, true); text(money(amount), cols.amt, y, 10, font, ink, true);
    y -= 28;
    page.drawLine({ start: { x: M, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 0.5, color: rule });
  }
  y -= 8;
  const total = (k: string, v: string, strong = false) => { text(k, 400, y, strong ? 11 : 10, strong ? bold : font, strong ? ink : muted, true); text(v, cols.amt, y, strong ? 11 : 10, strong ? bold : font, ink, true); y -= 18; };
  total('Subtotal', money(net)); if (tax > 0) total('GST (estimated)', money(tax)); total('Total', money(net + tax), true);
  if (input.po.notes) { y -= 10; text('Notes', M, y, 8.5, font, muted); y -= 14; for (const ln of input.po.notes.split('\n').slice(0, 6)) { text(ln.slice(0, 100), M, y, 9.5); y -= 13; } }
  return doc.save();
}
