import type { ParsedBankTransaction } from "./bank-csv-parse";
import { parseBankStatementFromText } from "./bank-csv-parse";

/** Text out of a PDF. Image-only (scanned) statements have none. */
export async function bankPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text ?? "";
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * Extract text from a bank PDF and attempt CSV-like parsing on the text blob.
 * Quality varies widely; callers should prefer CSV/OFX when available.
 * Columns in PDFs are usually separated by runs of spaces, so a second attempt treats two or more spaces as a column break.
 */
export async function parseBankPdfToTransactions(buffer: Buffer): Promise<ParsedBankTransaction[]> {
  const text = await bankPdfText(buffer);
  if (!text || text.trim().length < 20) return [];
  for (const candidate of [text, text.replace(/ {2,}/g, "\t")]) {
    const parsed = parseBankStatementFromText(candidate);
    if (parsed.ok && parsed.transactions.length > 0) {
      return parsed.transactions.map((t) => ({ ...t, parseFlags: { ...(t.parseFlags as object), source: "PDF" } }));
    }
  }
  return [];
}
