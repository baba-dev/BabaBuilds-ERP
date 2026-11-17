import path from "path";

import { buildPrivatePath } from "@/lib/uploads/private-storage";

const normalizePdfPath = (pdfPath: string) => (pdfPath.startsWith("/") ? pdfPath.slice(1) : pdfPath);

export const getInvoicePdfStoragePath = ({
  workspaceId,
  invoiceNumber,
  pdfPath,
}: {
  workspaceId: string;
  invoiceNumber: string;
  pdfPath: string;
}): string => {
  const normalized = normalizePdfPath(pdfPath);
  const fromPdfPath = normalized.split("/").filter(Boolean);
  if (fromPdfPath.length >= 3 && fromPdfPath[0] === "invoices") {
    // Expected persisted shape: /invoices/<workspaceId>/<filename>.pdf
    const [, persistedWorkspaceId, ...rest] = fromPdfPath;
    // The DB row belongs to workspaceId; never let its stored path cross tenants.
    // Accept existing nested invoice paths, but not unsafe or empty segments.
    if (
      persistedWorkspaceId === workspaceId &&
      rest.length > 0 &&
      rest.every((segment) => segment !== "." && !segment.includes("..") &&
        !segment.includes("\\") && !/[\u0000-\u001f\u007f]/.test(segment))
    ) {
      return buildPrivatePath("invoices", [workspaceId, ...rest]);
    }
  }

  const sanitizedFilename = `${invoiceNumber.replace(/\//g, "_")}.pdf`;
  return buildPrivatePath("invoices", [workspaceId, sanitizedFilename]);
};

export const getInvoicePdfRelativePath = ({
  workspaceId,
  invoiceNumber,
}: {
  workspaceId: string;
  invoiceNumber: string;
}) => `/invoices/${workspaceId}/${invoiceNumber.replace(/\//g, "_")}.pdf`;

export const getInvoicePdfFilename = (invoiceNumber: string) => `${invoiceNumber.replace(/\//g, "_")}.pdf`;

/**
 * Legacy invoice PDFs may still be under public/invoices. Never resolve a
 * persisted path outside that directory or into a different workspace.
 * Single-level legacy filenames remain supported for backwards compatibility.
 */
export const getInvoicePublicFallbackPath = (relativePath: string, workspaceId?: string): string | null => {
  const parts = (relativePath.startsWith("/") ? relativePath.slice(1) : relativePath).split("/");
  if (
    parts.length < 2 || parts[0] !== "invoices" ||
    parts.some((part) => !part || part === "." || part.includes("..") ||
      part.includes("\\") || /[\u0000-\u001f\u007f]/.test(part)) ||
    (workspaceId && parts.length >= 3 && parts[1] !== workspaceId)
  ) return null;
  const root = path.resolve(process.cwd(), "public", "invoices");
  const candidate = path.resolve(root, ...parts.slice(1));
  return candidate.startsWith(root + path.sep) ? candidate : null;
};

export const resolveInvoicePdfStoragePath = (invoice: {
  workspaceId: string;
  invoiceNumber: string;
  pdfPath: string;
}) => getInvoicePdfStoragePath({
  workspaceId: invoice.workspaceId,
  invoiceNumber: invoice.invoiceNumber,
  pdfPath: invoice.pdfPath,
});
