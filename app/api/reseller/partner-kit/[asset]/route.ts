import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logDistributorEvent } from "@/lib/observability-distributor";

export const runtime = "nodejs";

const ALLOWED_ASSETS = new Set([
  "sales-deck.pdf",
  "pricing-sheet.pdf",
  "whatsapp-script.pdf",
  "objection-sheet.pdf",
  "onboarding-checklist.pdf",
]);

const SPIKE_WINDOW_MS = 5 * 60 * 1000;
const SPIKE_THRESHOLD = 5;
const notFoundWindow = new Map<string, number[]>();

function trackNotFound(asset: string, reason: "allowlist_miss" | "file_missing") {
  const now = Date.now();
  const existing = notFoundWindow.get(asset) ?? [];
  const withinWindow = existing.filter((ts) => now - ts <= SPIKE_WINDOW_MS);
  withinWindow.push(now);
  notFoundWindow.set(asset, withinWindow);

  logDistributorEvent("partner_kit_asset_missing", {
    asset,
    reason,
    missesInWindow: withinWindow.length,
    windowMs: SPIKE_WINDOW_MS,
  });

  if (withinWindow.length === SPIKE_THRESHOLD) {
    logDistributorEvent("partner_kit_404_spike", {
      asset,
      reason,
      missesInWindow: withinWindow.length,
      windowMs: SPIKE_WINDOW_MS,
    });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  if (!ALLOWED_ASSETS.has(asset)) {
    trackNotFound(asset, "allowlist_miss");
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const absolutePath = path.join(process.cwd(), "public", "partner-kit", asset);
  try {
    const file = await fs.readFile(absolutePath);
    logDistributorEvent("partner_kit_download", { asset, bytes: file.byteLength });
    return new NextResponse(file, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(file.byteLength),
        "Content-Disposition": `inline; filename="${asset}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    trackNotFound(asset, "file_missing");
    return NextResponse.json({ error: "Asset unavailable" }, { status: 404 });
  }
}
