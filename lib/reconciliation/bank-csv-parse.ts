import Papa from "papaparse";
import { parse as parseDate, isValid as isValidDate } from "date-fns";

/** Parsed row aligned with reconcile UI (amount positive; type indicates sign). */
export type ParsedBankTransaction = {
  id?: string;
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  balance?: number;
  reference?: string;
  /** Running balance after row when source had balance column */
  balanceAfter?: number;
  /** Original currency code from file when mapped */
  originalCurrency?: string;
  /** Amount in originalCurrency when separate FX column exists */
  amountOriginalCurrency?: number;
  /** Parser / validation hints surfaced to UI */
  parseFlags?: Record<string, unknown>;
  /** Plaid / ISO20022 stable id for deduplication */
  providerTransactionId?: string;
};

export type ColumnRole =
  | "date"
  | "description"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "reference"
  | "originalCurrency"
  | "amountOriginalCurrency"
  | "ignore";

export type ColumnMapping = Partial<Record<Exclude<ColumnRole, "ignore">, number>>;

export type ParseBankStatementSuccess = {
  ok: true;
  transactions: ParsedBankTransaction[];
  headerRowIndex: number;
  delimiter: string;
  encoding: string;
  confidence: number;
  columnLabels: string[];
};

export type ParseBankStatementNeedsMapping = {
  ok: false;
  needsMapping: true;
  message: string;
  previewRows: string[][];
  candidateHeaderIndices: number[];
  delimiter: string;
  encoding: string;
};

export type ParseBankStatementResult = ParseBankStatementSuccess | ParseBankStatementNeedsMapping;

const HEADER_SCAN_LINES = 60;
const MIN_HEADER_SCORE = 4;
const MIN_HEADER_MARGIN = 2;

const DATE_KEYS = [
  "date",
  "datum",
  "txn date",
  "transaction date",
  "value date",
  "posting date",
  "booked on",
  "tran date",
  "buchungstag",
  "valuta",
];
const DESC_KEYS = [
  "description",
  "narration",
  "particulars",
  "details",
  "memo",
  "payee",
  "transaction details",
  "remarks",
  "hinweis",
  "verwendungszweck",
];
const DEBIT_KEYS = [
  "debit",
  "withdrawal",
  "paid out",
  "dr",
  "withdrawals",
  "money out",
  "belastung",
  "lastschrift",
];
const CREDIT_KEYS = [
  "credit",
  "deposit",
  "paid in",
  "cr",
  "deposits",
  "money in",
  "gutschrift",
  "haben",
];
const AMOUNT_KEYS = ["amount", "amt"];
const BALANCE_KEYS = ["balance", "closing balance", "running balance"];
const REF_KEYS = ["reference", "ref no", "refno", "cheque", "chq", "utr", "transaction id", "txn id"];
const CURR_KEYS = ["currency", "curr", "ccy", "waehrung"];
const ORIG_AMT_KEYS = [
  "original amount",
  "orig amount",
  "amount in orig",
  "foreign amount",
  "transaction currency amount",
];

function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

function matchesAny(norm: string, keys: string[]): boolean {
  if (!norm) return false;
  return keys.some((k) => norm === k || norm.includes(k));
}

function scoreHeaderRow(cells: string[]): number {
  let score = 0;
  const norms = cells.map((c) => normalizeHeader(String(c ?? "")));
  for (const n of norms) {
    if (matchesAny(n, DATE_KEYS)) score += 3;
    if (matchesAny(n, DESC_KEYS)) score += 3;
    if (matchesAny(n, DEBIT_KEYS)) score += 2;
    if (matchesAny(n, CREDIT_KEYS)) score += 2;
    if (matchesAny(n, AMOUNT_KEYS)) score += 3;
    if (matchesAny(n, BALANCE_KEYS)) score += 1;
    if (matchesAny(n, REF_KEYS)) score += 1;
  }
  return score;
}

/** Decode bank export buffers: UTF-8, UTF-16 LE/BE BOM, fallback latin1. */
export function decodeBankStatementBuffer(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.slice(2).toString("utf16le"), encoding: "utf-16le" };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.alloc(buffer.length - 2);
    for (let i = 2; i < buffer.length; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return { text: swapped.toString("utf16le"), encoding: "utf-16be" };
  }

  const utf8 = buffer.toString("utf-8");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  const utf8Len = Math.max(utf8.length, 1);
  const replacementRatio = replacementCount / utf8Len;
  if (
    replacementCount > 2 ||
    (replacementCount > 0 && replacementRatio > 0.05 && buffer.length >= 12)
  ) {
    return { text: buffer.toString("latin1"), encoding: "latin1" };
  }
  return { text: utf8, encoding: "utf-8" };
}

export function sniffDelimiter(line: string): string {
  const counts = {
    ",": (line.match(/,/g) || []).length,
    ";": (line.match(/;/g) || []).length,
    "\t": (line.match(/\t/g) || []).length,
  };
  let best: string = ",";
  let max = counts[","];
  if (counts[";"] > max) {
    max = counts[";"];
    best = ";";
  }
  if (counts["\t"] > max) {
    best = "\t";
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const r = Papa.parse<string[]>(line, {
    delimiter,
    header: false,
    skipEmptyLines: false,
  });
  const row = r.data[0];
  return Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : [];
}

export function parseRows(text: string, delimiter: string): string[][] {
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: false,
  });
  return (parsed.data as string[][]).map((row) => row.map((c) => String(c ?? "").trim()));
}

function autoMapColumns(headerCells: string[]): ColumnMapping | null {
  const mapping: ColumnMapping = {};
  headerCells.forEach((cell, index) => {
    const n = normalizeHeader(cell);
    if (matchesAny(n, DATE_KEYS)) mapping.date ??= index;
    else if (matchesAny(n, DESC_KEYS)) mapping.description ??= index;
    else if (matchesAny(n, DEBIT_KEYS)) mapping.debit ??= index;
    else if (matchesAny(n, CREDIT_KEYS)) mapping.credit ??= index;
    else if (matchesAny(n, AMOUNT_KEYS)) mapping.amount ??= index;
    else if (matchesAny(n, BALANCE_KEYS)) mapping.balance ??= index;
    else if (matchesAny(n, REF_KEYS)) mapping.reference ??= index;
    else if (matchesAny(n, CURR_KEYS)) mapping.originalCurrency ??= index;
    else if (matchesAny(n, ORIG_AMT_KEYS)) mapping.amountOriginalCurrency ??= index;
  });

  const hasAmount =
    mapping.amount !== undefined ||
    (mapping.debit !== undefined && mapping.credit !== undefined);
  if (mapping.date === undefined || mapping.description === undefined || !hasAmount) {
    return null;
  }
  return mapping;
}

function normalizeAmountString(raw: string): string {
  let s = String(raw).replace(/[₹$€£\s]/g, "").trim();
  const isNeg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()]/g, "").replace(/^-/, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // e.g. 1.234,56 (EU) vs 1,234.56 (US): last separator is decimal
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = s.split(",");
    if (parts.length === 2 && /^\d{1,2}$/.test(parts[1])) {
      s = `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  } else {
    s = s.replace(/,/g, "");
  }

  return isNeg ? `-${s}` : s;
}

function cleanAmount(val: string | undefined): number {
  if (val === undefined || val === null) return 0;
  const n = parseFloat(normalizeAmountString(String(val)));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function parseSignedAmount(val: string | undefined): number {
  if (val === undefined || val === null) return 0;
  const raw = String(val);
  const isNeg = /^\(.*\)$/.test(raw.trim()) || raw.trim().startsWith("-");
  const n = parseFloat(normalizeAmountString(raw));
  if (!Number.isFinite(n)) return 0;
  const abs = Math.abs(n);
  return isNeg ? -abs : abs;
}

export type DateParsePreference = "DMY" | "MDY" | "AUTO";

export function parseBankDate(raw: string, preference: DateParsePreference = "AUTO"): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  const isoTry = new Date(s);
  if (!Number.isNaN(isoTry.getTime()) && s.length >= 8) return isoTry;

  const formats =
    preference === "DMY"
      ? ["dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "dd.MM.yyyy", "yyyy-MM-dd"]
      : preference === "MDY"
        ? ["MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "yyyy-MM-dd", "dd/MM/yyyy"]
        : [
            "yyyy-MM-dd",
            "dd/MM/yyyy",
            "d/M/yyyy",
            "MM/dd/yyyy",
            "M/d/yyyy",
            "dd-MM-yyyy",
            "MM-dd-yyyy",
            "dd.MM.yyyy",
            "dd/MM/yy",
            "MM/dd/yy",
          ];

  for (const fmt of formats) {
    const d = parseDate(s, fmt, new Date());
    if (isValidDate(d)) return d;
  }

  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function rowToTransaction(
  row: string[],
  mapping: ColumnMapping,
  rowIndex: number,
  datePreference: DateParsePreference,
): ParsedBankTransaction | null {
  const dateRaw =
    mapping.date !== undefined ? row[mapping.date] : "";
  const descRaw =
    mapping.description !== undefined ? row[mapping.description] : "";

  const d = parseBankDate(dateRaw, datePreference);
  const dateStr = d ? d.toISOString() : new Date().toISOString();
  const description = String(descRaw || "Unknown").trim() || "Unknown";

  let amount = 0;
  let type: "DEBIT" | "CREDIT" = "DEBIT";

  if (mapping.amount !== undefined && mapping.debit === undefined && mapping.credit === undefined) {
    const signed = parseSignedAmount(row[mapping.amount]);
    amount = Math.abs(signed);
    type = signed >= 0 ? "CREDIT" : "DEBIT";
  } else {
    const debit =
      mapping.debit !== undefined ? cleanAmount(row[mapping.debit]) : 0;
    const credit =
      mapping.credit !== undefined ? cleanAmount(row[mapping.credit]) : 0;
    if (debit > 0 && credit > 0) {
      if (debit >= credit) {
        amount = debit;
        type = "DEBIT";
      } else {
        amount = credit;
        type = "CREDIT";
      }
    } else if (debit > 0) {
      amount = debit;
      type = "DEBIT";
    } else if (credit > 0) {
      amount = credit;
      type = "CREDIT";
    } else {
      return null;
    }
  }

  if (amount <= 0 || !Number.isFinite(amount)) return null;

  let balanceAfter: number | undefined;
  if (mapping.balance !== undefined) {
    const b = parseSignedAmount(row[mapping.balance]);
    if (Number.isFinite(b)) balanceAfter = b;
  }

  let reference: string | undefined;
  if (mapping.reference !== undefined && row[mapping.reference]) {
    reference = String(row[mapping.reference]).trim();
  }

  let originalCurrency: string | undefined;
  if (mapping.originalCurrency !== undefined && row[mapping.originalCurrency]) {
    originalCurrency = String(row[mapping.originalCurrency]).trim().slice(0, 8).toUpperCase();
  }

  let amountOriginalCurrency: number | undefined;
  if (mapping.amountOriginalCurrency !== undefined) {
    const o = parseSignedAmount(row[mapping.amountOriginalCurrency]);
    if (Number.isFinite(o) && Math.abs(o) > 0) {
      amountOriginalCurrency = Math.abs(o);
    }
  }

  return {
    id: `txn_${rowIndex}`,
    date: dateStr,
    description,
    amount,
    type,
    balance: balanceAfter,
    balanceAfter,
    reference,
    originalCurrency,
    amountOriginalCurrency,
  };
}

export function extractTransactionsFromGrid(args: {
  rows: string[][];
  headerRowIndex: number;
  mapping: ColumnMapping;
  datePreference?: DateParsePreference;
}): ParsedBankTransaction[] {
  const { rows, headerRowIndex, mapping } = args;
  const datePreference = args.datePreference ?? "AUTO";
  const dataRows = rows.slice(headerRowIndex + 1);
  const out: ParsedBankTransaction[] = [];
  let idx = 0;
  for (const row of dataRows) {
    if (!row.some((c) => String(c).trim())) continue;
    const txn = rowToTransaction(row, mapping, idx, datePreference);
    if (txn) {
      out.push(txn);
      idx++;
    }
  }
  return out;
}

export function normalizeGridRows(raw: unknown[][]): string[][] {
  return raw.map((row) =>
    (Array.isArray(row) ? row : []).map((c) => String(c ?? "").trim()),
  );
}

/**
 * Core parser: finds header row in a 2D grid (CSV or Excel sheet).
 */
export function parseBankStatementFromRows(
  rows: string[][],
  options?: {
    datePreference?: DateParsePreference;
    delimiter?: string;
    encoding?: string;
  },
): ParseBankStatementResult {
  const datePreference = options?.datePreference ?? "AUTO";
  const encoding = options?.encoding ?? "utf-8";

  const scanLimit = Math.min(rows.length, HEADER_SCAN_LINES);

  let bestIdx = -1;
  let bestScore = -1;
  let secondScore = -1;

  let delimiter = options?.delimiter ?? ",";
  if (!options?.delimiter && rows.length > 0) {
    const probeRow = rows.find((r) => r.some((c) => String(c).trim())) || rows[0];
    delimiter = sniffDelimiter(probeRow.join(","));
  }

  const candidateIndices: number[] = [];

  for (let i = 0; i < scanLimit; i++) {
    const cells = rows[i];
    if (!cells || cells.length < 3 || !cells.some((c) => String(c).trim())) continue;
    const sc = scoreHeaderRow(cells);
    if (sc >= 3) candidateIndices.push(i);
    if (sc > bestScore) {
      secondScore = bestScore;
      bestScore = sc;
      bestIdx = i;
    } else if (sc > secondScore) {
      secondScore = sc;
    }
  }

  if (bestIdx < 0 || bestScore < MIN_HEADER_SCORE || bestScore - secondScore < MIN_HEADER_MARGIN) {
    const previewRows = rows.slice(0, 20);
    return {
      ok: false,
      needsMapping: true,
      message:
        "Could not reliably detect the table header. Choose the header row and column mapping.",
      previewRows,
      candidateHeaderIndices: candidateIndices.slice(0, 8),
      delimiter,
      encoding,
    };
  }

  const headerRow = rows[bestIdx] || [];
  const mapping = autoMapColumns(headerRow);
  if (!mapping) {
    return {
      ok: false,
      needsMapping: true,
      message: "Header found but columns could not be mapped to date, description, and amounts.",
      previewRows: rows.slice(0, 20),
      candidateHeaderIndices: [bestIdx, ...candidateIndices.filter((x) => x !== bestIdx)].slice(0, 8),
      delimiter,
      encoding,
    };
  }

  const transactions = extractTransactionsFromGrid({
    rows,
    headerRowIndex: bestIdx,
    mapping,
    datePreference,
  });

  if (transactions.length === 0) {
    return {
      ok: false,
      needsMapping: true,
      message: "No valid transaction rows found. Adjust column mapping or date format.",
      previewRows: rows.slice(0, 20),
      candidateHeaderIndices: [bestIdx].concat(candidateIndices).slice(0, 8),
      delimiter,
      encoding,
    };
  }

  return {
    ok: true,
    transactions,
    headerRowIndex: bestIdx,
    delimiter,
    encoding,
    confidence: bestScore,
    columnLabels: headerRow,
  };
}

export function parseBankStatementFromText(
  text: string,
  options?: {
    datePreference?: DateParsePreference;
    delimiter?: string;
  },
): ParseBankStatementResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const probeLine =
    lines.find((l) => l.includes(",") || l.includes(";") || l.includes("\t")) || lines[0] || "";
  const delimiter = options?.delimiter ?? sniffDelimiter(probeLine);
  const rawGrid = parseRows(text, delimiter);
  return parseBankStatementFromRows(rawGrid, { ...options, delimiter, encoding: "utf-8" });
}

export function parseBankStatementFromBuffer(
  buffer: Buffer,
  options?: { datePreference?: DateParsePreference; delimiter?: string },
): ParseBankStatementResult & { encoding: string } {
  const { text, encoding } = decodeBankStatementBuffer(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const probeLine =
    lines.find((l) => l.includes(",") || l.includes(";") || l.includes("\t")) || lines[0] || "";
  const delimiter = options?.delimiter ?? sniffDelimiter(probeLine);
  const rawGrid = parseRows(text, delimiter);
  const r = parseBankStatementFromRows(rawGrid, { ...options, delimiter, encoding });
  return { ...r, encoding };
}

/** Parse using explicit mapping (manual step or re-run after user fixes header). */
export function parseBankStatementWithMapping(args: {
  text: string;
  headerRowIndex: number;
  mapping: ColumnMapping;
  delimiter: string;
  datePreference?: DateParsePreference;
}): ParsedBankTransaction[] {
  const rows = parseRows(args.text, args.delimiter);
  return extractTransactionsFromGrid({
    rows,
    headerRowIndex: args.headerRowIndex,
    mapping: args.mapping,
    datePreference: args.datePreference ?? "AUTO",
  });
}
