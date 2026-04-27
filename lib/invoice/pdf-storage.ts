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
    if (persistedWorkspaceId && rest.length > 0) {
      return buildPrivatePath("invoices", [persistedWorkspaceId, ...rest]);
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

export const getInvoicePublicFallbackPath = (relativePath: string) =>
  path.join(process.cwd(), "public", relativePath.startsWith("/") ? relativePath.slice(1) : relativePath);

export const resolveInvoicePdfStoragePath = (invoice: {
  workspaceId: string;
  invoiceNumber: string;
  pdfPath: string;
}) => getInvoicePdfStoragePath({
  workspaceId: invoice.workspaceId,
  invoiceNumber: invoice.invoiceNumber,
  pdfPath: invoice.pdfPath,
});
