const SUFFIXES = /\b(pvt|private|ltd|limited|llp|llc|inc|incorporated|corp|corporation|co|company|gmbh|plc|opc|sa|bv|ag|fzco|fze)\b/g;

/**
 * What two spellings of the same company have in common: "Acme Pvt. Ltd.", "ACME Private Limited" and "acme" all become
 * "acme". Used to warn about duplicates; the database still allows names that differ.
 */
export function duplicateKey(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const emailKey = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();
