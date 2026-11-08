import { addHeads, r2, zeroHeads, type TaxHeads } from "./money";

export type Utilisation = {
  igstCredit: { igst: number; cgst: number; sgst: number };
  cgstCredit: { cgst: number; igst: number };
  sgstCredit: { sgst: number; igst: number };
  cessCredit: { cess: number };
};

export type UtilisationResult = {
  utilisation: Utilisation;
  /** Liability left after credit: to be paid in cash. */
  cash: TaxHeads;
  /** Credit left in the electronic credit ledger. */
  remaining: TaxHeads;
};

/**
 * Apply input tax credit to a liability in the statutory order (CGST Act s.49A/49B, rule 88A):
 * IGST credit first against IGST, then CGST, then SGST; CGST credit against CGST then IGST; SGST credit
 * against SGST then IGST (CGST and SGST credit never cross); cess credit only against cess.
 */
export function utilizeItc(liability: TaxHeads, credit: TaxHeads): UtilisationResult {
  const L = { ...liability };
  const C = { ...credit };
  const take = (avail: number, owed: number) => Math.max(0, Math.min(avail, owed));
  const u: Utilisation = {
    igstCredit: { igst: 0, cgst: 0, sgst: 0 },
    cgstCredit: { cgst: 0, igst: 0 },
    sgstCredit: { sgst: 0, igst: 0 },
    cessCredit: { cess: 0 },
  };

  let a = take(C.igst, L.igst);
  u.igstCredit.igst = a; L.igst -= a; C.igst -= a;
  a = take(C.igst, L.cgst);
  u.igstCredit.cgst = a; L.cgst -= a; C.igst -= a;
  a = take(C.igst, L.sgst);
  u.igstCredit.sgst = a; L.sgst -= a; C.igst -= a;

  a = take(C.cgst, L.cgst);
  u.cgstCredit.cgst = a; L.cgst -= a; C.cgst -= a;
  a = take(C.cgst, L.igst);
  u.cgstCredit.igst = a; L.igst -= a; C.cgst -= a;

  a = take(C.sgst, L.sgst);
  u.sgstCredit.sgst = a; L.sgst -= a; C.sgst -= a;
  a = take(C.sgst, L.igst);
  u.sgstCredit.igst = a; L.igst -= a; C.sgst -= a;

  a = take(C.cess, L.cess);
  u.cessCredit.cess = a; L.cess -= a; C.cess -= a;

  const clean = (h: TaxHeads): TaxHeads => ({ igst: r2(h.igst), cgst: r2(h.cgst), sgst: r2(h.sgst), cess: r2(h.cess) });
  return { utilisation: u, cash: clean(L), remaining: clean(C) };
}

export { addHeads, zeroHeads };
