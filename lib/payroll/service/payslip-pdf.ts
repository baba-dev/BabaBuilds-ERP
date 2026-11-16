import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { RunLineDto } from './detail';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${below100(n % 100)}` : ''}` : below100(n));

/** Indian numbering: crore, lakh, thousand. */
export function rupeesInWords(amount: number): string {
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000), lakh = Math.floor((rupees % 10_000_000) / 100_000), thousand = Math.floor((rupees % 100_000) / 1000), rest = rupees % 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  const words = parts.join(' ') || 'Zero';
  return `${words} Rupees${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}

const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const money = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type PayslipPdfInput = {
  company: { name: string; address?: string | null; gstin?: string | null };
  monthLabel: string;
  line: RunLineDto;
  paidDays: number;
  daysInMonth: number;
  identifiers: { panLast4?: string | null; uan?: string | null };
};

/** One employee's payslip as an A4 PDF. Labels are English and the built-in fonts are Latin only. */
export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const { line: l } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const page = doc.addPage([W, H]);
  const ink = rgb(0.1, 0.1, 0.12), muted = rgb(0.42, 0.44, 0.5), rule = rgb(0.88, 0.89, 0.91), band = rgb(0.96, 0.96, 0.98), accent = rgb(0.31, 0.27, 0.9);
  const text = (s: string, x: number, y: number, size = 10, f = font, color = ink, right = false) => {
    const t = safe(s);
    page.drawText(t, { x: right ? x - f.widthOfTextAtSize(t, size) : x, y, size, font: f, color });
  };

  page.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: band });
  text(input.company.name, M, H - 40, 16, bold);
  if (input.company.address) text(input.company.address.split('\n')[0]!.slice(0, 90), M, H - 58, 8.5, font, muted);
  if (input.company.gstin) text(`GSTIN ${input.company.gstin}`, M, H - 72, 8.5, font, muted);
  text('PAYSLIP', W - M, H - 40, 15, bold, accent, true);
  text(input.monthLabel, W - M, H - 58, 10, font, muted, true);

  let y = H - 118;
  const info: [string, string][] = [
    ['Employee', l.employee.name], ['Employee code', l.employee.code ?? '-'],
    ['Department', l.employee.department ?? '-'], ['Designation', l.employee.designation ?? '-'],
    ['Days paid', `${input.paidDays} of ${input.daysInMonth}`], ['Loss of pay days', String(l.lopDays)],
    ['PAN', input.identifiers.panLast4 ? `XXXXXX${input.identifiers.panLast4}` : '-'], ['UAN', input.identifiers.uan ?? '-'],
    ['Bank account', l.payment.accountLast4 ? `${l.payment.bankName ?? ''} XXXX${l.payment.accountLast4}` : '-'], ['IFSC', l.payment.ifsc ?? '-'],
  ];
  for (let i = 0; i < info.length; i += 2) {
    for (let c = 0; c < 2; c++) {
      const [k, v] = info[i + c]!;
      const x = M + c * ((W - M * 2) / 2);
      text(k, x, y, 8, font, muted);
      text(v, x, y - 12, 10, bold);
    }
    y -= 32;
  }

  y -= 6;
  const colW = (W - M * 2 - 20) / 2;
  const drawTable = (title: string, rows: { label: string; amount: number }[], x: number, total: { label: string; amount: number }) => {
    page.drawRectangle({ x, y: y - 4, width: colW, height: 20, color: band });
    text(title, x + 8, y + 2, 9, bold);
    text('Amount (INR)', x + colW - 8, y + 2, 8, font, muted, true);
    let yy = y - 22;
    for (const r of rows) {
      text(r.label, x + 8, yy, 9.5, font, ink);
      text(money(r.amount), x + colW - 8, yy, 9.5, font, ink, true);
      yy -= 17;
    }
    return { yy, total, x };
  };
  const earn = drawTable('Earnings', l.earnings.map((e) => ({ label: e.label, amount: e.amount })), M, { label: 'Gross earnings', amount: l.gross });
  const ded = drawTable('Deductions', l.deductionLines.map((e) => ({ label: e.label, amount: e.amount })), M + colW + 20, { label: 'Total deductions', amount: l.deductions });
  const bottom = Math.min(earn.yy, ded.yy) - 4;
  for (const t of [earn, ded]) {
    page.drawLine({ start: { x: t.x, y: bottom + 12 }, end: { x: t.x + colW, y: bottom + 12 }, thickness: 0.7, color: rule });
    text(t.total.label, t.x + 8, bottom - 4, 10, bold);
    text(money(t.total.amount), t.x + colW - 8, bottom - 4, 10, bold, ink, true);
  }

  y = bottom - 44;
  page.drawRectangle({ x: M, y: y - 14, width: W - M * 2, height: 52, color: rgb(0.93, 0.93, 1) });
  text('Net pay', M + 14, y + 16, 9, font, muted);
  text(`INR ${money(l.netPay)}`, M + 14, y - 4, 18, bold, accent);
  text(rupeesInWords(l.netPay), W - M - 14, y + 3, 9, font, ink, true);

  y -= 46;
  if (l.employerLines.length > 0) {
    text('Employer contributions (not deducted from your pay)', M, y, 8.5, bold, muted);
    y -= 14;
    for (const e of l.employerLines) { text(e.label, M, y, 8.5, font, muted); text(money(e.amount), M + 260, y, 8.5, font, muted, true); y -= 12; }
  }
  text('This is a computer generated payslip and does not need a signature.', W / 2 - 150, 36, 8, font, muted);
  return doc.save();
}
