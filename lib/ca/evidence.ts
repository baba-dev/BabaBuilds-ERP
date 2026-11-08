import "server-only";
import { buildPrivatePath } from "@/lib/uploads/private-storage";

/** Map a stored invoice PDF path (/invoices/<workspace>/<file>) to the private file, only for this workspace. */
export function invoiceFile(workspaceId: string, pdfPath: string): string | null {
  const parts = pdfPath.replace(/^[/\\]+/, "").split("/").filter(Boolean);
  if (!(parts[0] === "invoices" && parts[1] === workspaceId) || parts.slice(2).some((p) => p === ".." || p === ".")) return null;
  return buildPrivatePath("invoices", [parts[1], parts.slice(2).join("/")]);
}

export function receiptFile(workspaceId: string, receiptUrl: string): string | null {
  const parts = receiptUrl.replace(/^[/\\]+/, "").split("/").filter(Boolean);
  if (!(parts[0] === "receipts" && parts[1] === workspaceId) || parts.slice(2).some((p) => p === ".." || p === ".")) return null;
  return buildPrivatePath("receipts", [parts[1], parts.slice(2).join("/")]);
}

export const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "file";
