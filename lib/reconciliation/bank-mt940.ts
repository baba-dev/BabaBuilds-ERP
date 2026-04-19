import type { ParsedBankTransaction } from "./bank-csv-parse";

/**
 * Minimal MT940 SWIFT parser: :61: statement lines + optional :86: continuation.
 */
export function parseMt940ToTransactions(text: string): ParsedBankTransaction[] {
  const norm = text.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  const out: ParsedBankTransaction[] = [];
  let pending61: string | null = null;

  const parse61Line = (block: string, idNum: number): ParsedBankTransaction | null => {
    const raw = block.startsWith(":61:") ? block.slice(4).trim() : block.trim();
    const dc =
      raw[0] === "D" ? ("DEBIT" as const) : raw[0] === "C" ? ("CREDIT" as const) : null;
    if (!dc) return null;

    let rest = raw.slice(1);
    let dateIso = new Date().toISOString();

    const dateM = /^(\d{6})/.exec(rest);
    if (dateM) {
      const ds = dateM[1];
      const yy = parseInt(ds.slice(0, 2), 10);
      const mm = parseInt(ds.slice(2, 4), 10);
      const dd = parseInt(ds.slice(4, 6), 10);
      const year = 2000 + yy;
      const d = new Date(year, mm - 1, dd);
      if (!Number.isNaN(d.getTime())) dateIso = d.toISOString();
      rest = rest.slice(6);
    }

    rest = rest.replace(/^M/, "");
    rest = rest.replace(/^R\d{3}/, "");

    const amtM = /^([ND]?)(\d+[.,]\d+)/.exec(rest);
    if (!amtM) return null;
    let amt = parseFloat(amtM[2].replace(/,/g, "."));
    if (!Number.isFinite(amt)) return null;
    if (dc === "DEBIT") amt = -Math.abs(amt);
    else amt = Math.abs(amt);

    const narrative = rest.slice((amtM.index ?? 0) + amtM[0].length).trim();

    const type: "DEBIT" | "CREDIT" = dc;
    const absAmt = Math.abs(amt);

    return {
      id: `mt940_${idNum}`,
      date: dateIso,
      description: narrative.slice(0, 2000) || "MT940",
      amount: absAmt,
      type,
      reference: narrative.slice(0, 120) || undefined,
      parseFlags: { source: "MT940" },
    };
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(":61:")) {
      pending61 = t;
      continue;
    }
    if (pending61 && t.startsWith(":86:")) {
      const combined = `${pending61}\n${t}`;
      const row = parse61Line(combined.replace(/\r?\n/g, " "), out.length);
      if (row) out.push(row);
      pending61 = null;
      continue;
    }
    if (pending61 && t.length > 0 && !t.startsWith(":")) {
      const row = parse61Line(`${pending61} ${t}`, out.length);
      if (row) out.push(row);
      pending61 = null;
      continue;
    }
  }

  if (pending61) {
    const row = parse61Line(pending61, out.length);
    if (row) out.push(row);
  }

  return out;
}
