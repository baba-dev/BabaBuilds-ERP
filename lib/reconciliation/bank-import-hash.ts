import { createHash } from "node:crypto";

/** Normalize narration for stable dedupe across minor bank formatting changes. */
export function normalizeDescriptionForHash(description: string): string {
  return description
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function computeBankRowImportHash(args: {
  accountId: string;
  workspaceId: string;
  dateIso: string;
  amountSigned: string;
  description: string;
  reference?: string | null;
}): string {
  const desc = normalizeDescriptionForHash(args.description);
  const ref = (args.reference ?? "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 120);
  const payload = [
    args.workspaceId,
    args.accountId,
    args.dateIso,
    args.amountSigned,
    desc,
    ref,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
