import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logDistributorEvent } from "@/lib/observability-distributor";

const ALLOWED_ASSETS = new Set([
  "sales-deck.pdf",
  "pricing-sheet.pdf",
  "whatsapp-script.pdf",
  "objection-sheet.pdf",
  "onboarding-checklist.pdf",
]);

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!ALLOWED_ASSETS.has(asset)) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const absolutePath = path.join(process.cwd(), "public", "partner-kit", asset);
  try {
    const file = await fs.readFile(absolutePath);
    logDistributorEvent("partner_kit_download", { asset });
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${asset}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset unavailable" }, { status: 404 });
  }
}
