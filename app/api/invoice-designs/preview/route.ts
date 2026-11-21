import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit-memory";
import { isInvoiceDesignId } from "@/lib/invoice-templates/catalog";
import { getOrRenderPreview } from "@/lib/invoice-templates/preview-cache";
import { renderPreviewPdf } from "@/lib/invoice-templates/preview-render";
import { loadPreviewParams } from "@/lib/invoice/preview-loader";
import { applyPreviewOverrides } from "@/lib/invoice/preview-params";

export const dynamic = "force-dynamic";

type PreviewSession = { workspaceId?: string; user?: { id?: string | null } } | null;

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "invoice";

/** Renders one design for the caller's invoice (or a sample). Read-only; never creates a link or writes a file. */
export async function GET(request: Request) {
  const session = (await getServerSession(authOptions)) as PreviewSession;
  const workspaceId = session?.workspaceId;
  const userId = session?.user?.id;
  if (!workspaceId || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams;
  const design = q.get("design");
  if (!isInvoiceDesignId(design)) return NextResponse.json({ error: "Unknown design.", code: "DESIGN" }, { status: 400 });

  const limited = await checkRateLimit(`invoice-design-preview:${userId}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many previews. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } });
  }

  const invoiceId = q.get("invoiceId")?.trim() || null;
  const source = await loadPreviewParams({ workspaceId, invoiceId, design });
  if (!source) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const tdsRaw = q.get("tds");
  const params = applyPreviewOverrides(source.params, {
    design,
    accent: q.get("accent"),
    tdsRatePercent: tdsRaw === null || tdsRaw === "" ? undefined : Number(tdsRaw),
    tdsSection: q.get("tdsSection") ?? undefined,
  });

  const { bytes, state } = await getOrRenderPreview({ workspaceId, design, params, render: () => renderPreviewPdf(params) });
  const download = q.get("download") === "1";
  const filename = `invoice-${safeName(source.invoice?.number ?? "sample")}-${design}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Preview-Cache": state,
      "X-Preview-Sample": source.isSample ? "1" : "0",
    },
  });
}
