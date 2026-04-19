import { XMLParser } from "fast-xml-parser";
import type { ParsedBankTransaction } from "./bank-csv-parse";

function first<T>(v: T | T[] | undefined): T | undefined {
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function textMoney(amt: unknown): number | null {
  if (amt === undefined || amt === null) return null;
  if (typeof amt === "number" && Number.isFinite(amt)) return amt;
  if (typeof amt === "object" && amt !== null && "#text" in (amt as object)) {
    const n = parseFloat(String((amt as { "#text": string })["#text"]).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseFloat(String(amt).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(v: unknown): Date | null {
  if (!v) return null;
  const o = typeof v === "object" && v !== null ? (v as { Dt?: string }) : null;
  const s = o?.Dt ?? (typeof v === "string" ? v : null);
  if (!s || typeof s !== "string") return null;
  const d = new Date(s.slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ISO 20022 camt.053 — extracts statement entries (best-effort across variants).
 */
export function parseCamt053ToTransactions(xmlText: string): ParsedBankTransaction[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  let doc: unknown;
  try {
    doc = parser.parse(xmlText);
  } catch {
    return [];
  }

  const docObj = doc as Record<string, unknown>;
  const root =
    docObj.Document ??
    docObj["Document"] ??
    docObj;

  const rootRec = root as Record<string, unknown>;
  const firstChild = first(rootRec) as Record<string, unknown> | undefined;
  const bk = (firstChild?.BkToCstmrStmt ??
    rootRec.BkToCstmrStmt) as Record<string, unknown> | undefined;
  const stmt =
    first(
      bk?.Stmt as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | undefined,
    ) ?? first(rootRec?.Stmt as never);

  if (!stmt || typeof stmt !== "object") return [];

  const entries = (stmt as Record<string, unknown>).Ntry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];

  const out: ParsedBankTransaction[] = [];
  let idx = 0;

  for (const ntry of list) {
    if (!ntry || typeof ntry !== "object") continue;
    const row = ntry as Record<string, unknown>;
    const amtVal = textMoney(row.Amt);
    const cdtDbt = String(row.CdtDbtInd ?? "").toUpperCase();
    if (amtVal === null || amtVal === 0) continue;

    const isCredit = cdtDbt === "CRDT";
    const amount = Math.abs(amtVal);
    const type: "DEBIT" | "CREDIT" = isCredit ? "CREDIT" : "DEBIT";

    const bookg = parseIsoDate(row.BookgDt) ?? parseIsoDate(row.ValDt);
    const dateIso = bookg ? bookg.toISOString() : new Date().toISOString();

    let description = "CAMT entry";
    const dtls = first(row.NtryDtls as Record<string, unknown> | Record<string, unknown>[] | undefined);
    if (dtls && typeof dtls === "object") {
      const tx = first((dtls as Record<string, unknown>).TxDtls as Record<string, unknown> | Record<string, unknown>[] | undefined);
      if (tx && typeof tx === "object") {
        const refs = (tx as Record<string, unknown>).Refs as Record<string, unknown> | undefined;
        const endToEnd = refs?.EndToEndId ? String(refs.EndToEndId) : "";
        const addtl = String((tx as Record<string, unknown>).AddtlTxInf ?? "");
        description = [endToEnd, addtl].filter(Boolean).join(" · ").slice(0, 2000) || description;
      }
    }
    const addtlNtry = String(row.AddtlNtryInf ?? "");
    if (addtlNtry) description = `${description} ${addtlNtry}`.slice(0, 2000);

    let providerId: string | undefined;
    const refs = row.NtryRef ? String(row.NtryRef) : "";
    const acctSvcr = row.AcctSvcrRef ? String(row.AcctSvcrRef) : "";
    if (refs) providerId = refs.slice(0, 120);
    else if (acctSvcr) providerId = acctSvcr.slice(0, 120);

    out.push({
      id: `camt_${idx}`,
      date: dateIso,
      description,
      amount,
      type,
      reference: refs || undefined,
      providerTransactionId: providerId,
      parseFlags: { source: "CAMT053" },
    });
    idx++;
  }

  return out;
}
