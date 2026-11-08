import { retainerError, requireRetainerAccess } from "@/lib/retainers/access";
import { renderNextInvoicePreview } from "@/lib/retainers/billing";

/** The next invoice as a PDF, exactly as it would be issued, without issuing it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRetainerAccess("retainers.view");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const out = await renderNextInvoicePreview({ retainerId: id, workspaceId: auth.access.workspaceId });
  if (!out.ok) return retainerError(out.status, out.code, out.message);
  return new Response(Buffer.from(out.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${out.fileName}"`, "Cache-Control": "private, no-store" },
  });
}
