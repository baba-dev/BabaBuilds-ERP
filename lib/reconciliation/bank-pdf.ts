import type { ParsedBankTransaction } from "./bank-csv-parse";
import { parseBankStatementFromText } from "./bank-csv-parse";

/**
 * Extract text from a bank PDF and attempt CSV-like parsing on the text blob.
 * Quality varies widely; callers should prefer CSV/OFX when available.
 */
export async function parseBankPdfToTransactions(
  buffer: Buffer,
): Promise<ParsedBankTransaction[]> {
  const mod = await import("pdf-parse");
  const pdfParse = (mod as { default?: (b: Buffer) => Promise<{ text: string }> }).default;
  if (typeof pdfParse !== "function") {
    return [];
  }
  const { text } = await pdfParse(buffer);
  if (!text || text.trim().length < 20) return [];

  const parsed = parseBankStatementFromText(text);
  if (parsed.ok) {
    return parsed.transactions.map((t) => ({
      ...t,
      parseFlags: { ...(t.parseFlags as object), source: "PDF" },
    }));
  }
  return [];
}
