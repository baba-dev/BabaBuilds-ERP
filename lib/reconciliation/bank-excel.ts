import ExcelJS from "exceljs";
import { normalizeGridRows } from "./bank-csv-parse";

/** First worksheet as a string grid for bank statement parsing. */
export async function excelBufferToGrid(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const matrix = worksheet.getSheetValues().slice(1).map((row) => {
    if (!Array.isArray(row)) return [];
    return row.slice(1).map((cell) => String(cell ?? ""));
  });
  return normalizeGridRows(matrix as unknown[][]);
}
