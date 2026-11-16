import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

export type ReceiptInput = {
  company: { name: string; address?: string | null; gstin?: string | null; phone?: string | null };
  receipt: { number: string; date: Date; customer: string | null; method: string | null; reference: string | null };
  lines: { name: string; quantity: number; unitPrice: number; total: number }[];
  totals: { subtotal: number; tax: number; total: number };
  currency: string;
  locale: string;
};

/** A till receipt: 80 mm wide, as tall as it needs to be. Labels are English and the built-in fonts are Latin only. */
export async function buildReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const W = 226; // 80 mm in points
  const M = 12;
  const rowH = 12;
  const wrap = (s: string, max: number) => {
    const out: string[] = [];
    let cur = '';
    for (const w of safe(s).split(/\s+/)) {
      if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  };
  const money = (n: number) => new Intl.NumberFormat(input.locale, { style: 'currency', currency: input.currency }).format(n).replace(/[^\x20-\x7E]/g, (c) => (c === '₹' ? 'Rs.' : '')).trim();

  const head = [...wrap(input.company.name, 28), ...(input.company.address ? wrap(input.company.address.split('\n')[0]!, 36).slice(0, 2) : [])];
  const body = input.lines.flatMap((l) => [...wrap(l.name, 34), `__qty__${l.quantity} x ${money(l.unitPrice)}|${money(l.total)}`]);
  const H = 120 + head.length * rowH + body.length * rowH + 7 * rowH + (input.receipt.reference ? rowH : 0);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);
  const ink = rgb(0.1, 0.1, 0.12), muted = rgb(0.42, 0.44, 0.5);
  let y = H - 22;
  const center = (s: string, size = 9, f = font, color = ink) => { const t = safe(s); page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color }); y -= rowH + (size > 10 ? 3 : 0); };
  const pair = (l: string, r: string, f = font, size = 9, color = ink) => { page.drawText(safe(l), { x: M, y, size, font: f, color }); const t = safe(r); page.drawText(t, { x: W - M - f.widthOfTextAtSize(t, size), y, size, font: f, color }); y -= rowH; };
  const rule = () => { page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: muted }); y -= 4; };

  head.forEach((h, i) => center(h, i === 0 ? 11 : 8, i === 0 ? bold : font, i === 0 ? ink : muted));
  if (input.company.gstin) center(`GSTIN ${input.company.gstin}`, 8, font, muted);
  if (input.company.phone) center(`Tel ${input.company.phone}`, 8, font, muted);
  y -= 4; rule();
  pair('Receipt', input.receipt.number, bold);
  pair('Date', input.receipt.date.toISOString().slice(0, 16).replace('T', ' '), font, 8.5, muted);
  if (input.receipt.customer) pair('Customer', input.receipt.customer.slice(0, 28), font, 8.5, muted);
  rule();
  for (const row of body) {
    if (row.startsWith('__qty__')) { const [l, r] = row.slice(7).split('|'); pair(`  ${l}`, r!, font, 8.5, muted); } else { page.drawText(row, { x: M, y, size: 9, font, color: ink }); y -= rowH; }
  }
  rule();
  pair('Subtotal', money(input.totals.subtotal), font, 9, muted);
  if (input.totals.tax > 0) pair('GST', money(input.totals.tax), font, 9, muted);
  pair('TOTAL', money(input.totals.total), bold, 11);
  y -= 2;
  if (input.receipt.method) pair('Paid by', input.receipt.method.replace('_', ' '), font, 8.5, muted);
  if (input.receipt.reference) pair('Ref', input.receipt.reference.slice(0, 24), font, 8.5, muted);
  y -= 6;
  center('Thank you for your purchase', 8.5, font, muted);
  return doc.save();
}
