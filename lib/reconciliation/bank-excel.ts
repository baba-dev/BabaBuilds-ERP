import * as XLSX from "xlsx";
import { normalizeGridRows } from "./bank-csv-parse";

/** First worksheet as a string grid for bank statement parsing. */
export function excelBufferToGrid(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  return normalizeGridRows(matrix as unknown[][]);
}
