import { createHash } from "node:crypto";

export function computeBankRowImportHash(args: {
  accountId: string;
  workspaceId: string;
  dateIso: string;
  amountSigned: string;
  description: string;
  reference?: string | null;
}): string {
  const desc = args.description.trim().slice(0, 500);
  const ref = (args.reference ?? "").trim().slice(0, 120);
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
