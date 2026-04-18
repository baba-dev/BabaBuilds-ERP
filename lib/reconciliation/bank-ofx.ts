import type { ParsedBankTransaction } from "./bank-csv-parse";

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Minimal OFX 1.x / SGML transaction extraction (common bank export).
 */
export function parseOfxTransactions(text: string): ParsedBankTransaction[] {
  const upper = text.toUpperCase();
  if (!upper.includes("<OFX>") && !upper.includes("<BANKTRANLIST")) {
    return [];
  }

  const trnBlocks = text.split(/<STMTTRN>/i).slice(1);
  const out: ParsedBankTransaction[] = [];

  for (let i = 0; i < trnBlocks.length; i++) {
    const block = trnBlocks[i].split(/<\/STMTTRN>/i)[0];
    const dtRaw =
      getTag(block, "DTPOSTED") ||
      getTag(block, "DTUSER") ||
      getTag(block, "DTAVAIL");
    const amtRaw = getTag(block, "TRNAMT");
    const fitid = getTag(block, "FITID");
    const name = getTag(block, "NAME");
    const memo = getTag(block, "MEMO");
    if (!amtRaw) continue;

    const amt = parseFloat(amtRaw.replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt === 0) continue;

    let dateIso = new Date().toISOString();
    if (dtRaw && dtRaw.length >= 8) {
      const y = dtRaw.slice(0, 4);
      const mo = dtRaw.slice(4, 6);
      const d = dtRaw.slice(6, 8);
      const parsed = new Date(`${y}-${mo}-${d}`);
      if (!Number.isNaN(parsed.getTime())) dateIso = parsed.toISOString();
    }

    const description = [name, memo].filter(Boolean).join(" — ") || "OFX transaction";
    const type: "DEBIT" | "CREDIT" = amt < 0 ? "DEBIT" : "CREDIT";

    out.push({
      id: `ofx_${i}`,
      date: dateIso,
      description: stripTags(description).slice(0, 2000),
      amount: Math.abs(amt),
      type,
      reference: fitid || undefined,
      parseFlags: { source: "OFX" },
    });
  }

  return out;
}
