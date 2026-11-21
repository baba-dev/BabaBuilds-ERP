import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

let session: unknown = { workspaceId: "ws1", user: { id: "u1" } };
let loaded: unknown = null;
let limitOk = true;
const loadSpy = vi.fn();
const renderSpy = vi.fn(async () => new TextEncoder().encode("%PDF-1.7 fake"));

vi.mock("next-auth/next", () => ({ getServerSession: async () => session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/rate-limit-memory", () => ({ checkRateLimit: async () => (limitOk ? { ok: true } : { ok: false, retryAfterMs: 5000 }) }));
vi.mock("@/lib/invoice/preview-loader", () => ({ loadPreviewParams: async (a: unknown) => { loadSpy(a); return loaded; } }));
vi.mock("@/lib/invoice-templates/preview-render", () => ({ renderPreviewPdf: (...a: unknown[]) => renderSpy(...(a as [])) }));
vi.mock("@/lib/invoice-templates/preview-cache", () => ({
  getOrRenderPreview: async (a: { render: () => Promise<Uint8Array> }) => ({ bytes: await a.render(), state: "MISS" }),
}));

import { GET } from "@/app/api/invoice-designs/preview/route";

const call = (qs: string) => GET(new Request(`http://localhost/api/invoice-designs/preview?${qs}`));
const sample = () => ({ params: SAMPLE_INVOICES.gstIntra, invoice: { id: "i1", number: "INV/001", clientName: "Acme", date: new Date() }, isSample: false });

beforeEach(() => { session = { workspaceId: "ws1", user: { id: "u1" } }; loaded = sample(); limitOk = true; vi.clearAllMocks(); });

describe("GET /api/invoice-designs/preview", () => {
  it("401 without a session", async () => {
    session = null;
    expect((await call("design=DESIGN_3")).status).toBe(401);
  });
  it("400 for an unknown design", async () => {
    expect((await call("design=DESIGN_99")).status).toBe(400);
    expect((await call("")).status).toBe(400);
  });
  it("404 when the invoice is not in the caller's workspace", async () => {
    loaded = null;
    const r = await call("design=DESIGN_3&invoiceId=theirs");
    expect(r.status).toBe(404);
    expect(loadSpy).toHaveBeenCalledWith({ workspaceId: "ws1", invoiceId: "theirs", design: "DESIGN_3" });
  });
  it("200 PDF with cache header, inline by default", async () => {
    const r = await call("design=DESIGN_3");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("x-preview-cache")).toBe("MISS");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toMatch(/^inline/);
    expect(new TextDecoder().decode(await r.arrayBuffer()).startsWith("%PDF")).toBe(true);
  });
  it("download=1 gives a sanitised attachment filename", async () => {
    const r = await call("design=DESIGN_5&download=1");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="invoice-INV_001-DESIGN_5.pdf"');
  });
  it("ignores a hostile accent", async () => {
    await call("design=DESIGN_3&accent=%22%3E%3Cscript%3E");
    const params = (renderSpy.mock.calls[0] as unknown as [{ accentColor?: string }])[0];
    expect(params.accentColor).toBe(SAMPLE_INVOICES.gstIntra.accentColor);
  });
  it("applies a valid accent and TDS override", async () => {
    await call("design=DESIGN_3&accent=%230B3D91&tds=10&tdsSection=194j");
    const params = (renderSpy.mock.calls[0] as unknown as [{ accentColor?: string; tds?: { section: string; ratePercent: number } }])[0];
    expect(params.accentColor).toBe("#0B3D91");
    expect(params.tds).toMatchObject({ ratePercent: 10, section: "194J" });
  });
  it("429 with Retry-After when rate limited", async () => {
    limitOk = false;
    const r = await call("design=DESIGN_3");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("5");
  });
});
