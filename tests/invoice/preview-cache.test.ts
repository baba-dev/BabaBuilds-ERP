import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";

const store = new Map<string, Buffer>();
let redisOn = true;
let getThrows = false;
let lockHeldByOther = false;
const client = {
  getBuffer: vi.fn(async (k: string) => { if (getThrows) throw new Error("down"); return store.get(k) ?? null; }),
  set: vi.fn(async (k: string, v: Buffer | string, ...rest: unknown[]) => {
    if (rest.includes("NX")) { if (lockHeldByOther) return null; return "OK"; }
    store.set(k, Buffer.from(v)); return "OK";
  }),
  del: vi.fn(async () => 1),
};
vi.mock("@/lib/redis/client", () => ({ getRedisClient: async () => (redisOn ? client : null) }));
vi.mock("@/lib/redis/config", () => ({
  loadRedisConfig: () => ({ enabled: redisOn, namespace: "t", features: { cache: true }, urls: { dataCache: "redis://x" } }),
  redisKey: (_c: unknown, cat: string, ...s: string[]) => ["t", cat, ...s].join(":"),
}));
vi.mock("@/lib/pdf/generator", () => ({ generateInvoicePDF: async () => new Uint8Array([1, 2, 3]) }));

import { getOrRenderPreview, previewCacheKey, resetPreviewCacheForTests } from "@/lib/invoice-templates/preview-cache";
import { renderPreviewPdf } from "@/lib/invoice-templates/preview-render";

const params = SAMPLE_INVOICES.gstIntra;
const base = { workspaceId: "ws1", design: "DESIGN_3", params };

beforeEach(() => {
  store.clear(); resetPreviewCacheForTests(); redisOn = true; getThrows = false; lockHeldByOther = false; vi.clearAllMocks();
});

describe("previewCacheKey", () => {
  it("is stable and sensitive to design, accent, tds, amount and workspace", () => {
    const k = previewCacheKey(base);
    expect(previewCacheKey({ ...base })).toBe(k);
    expect(previewCacheKey({ ...base, design: "DESIGN_4" })).not.toBe(k);
    expect(previewCacheKey({ ...base, workspaceId: "ws2" })).not.toBe(k);
    expect(previewCacheKey({ ...base, params: { ...params, accentColor: "#112233" } })).not.toBe(k);
    expect(previewCacheKey({ ...base, params: { ...params, tds: { section: "194J", ratePercent: 10 } } as never })).not.toBe(k);
    expect(previewCacheKey({ ...base, params: { ...params, totals: { ...params.totals, total: 1 } } })).not.toBe(k);
  });
});

describe("getOrRenderPreview", () => {
  it("renders once (MISS), then HITs", async () => {
    const render = vi.fn(async () => new Uint8Array([9]));
    const a = await getOrRenderPreview({ ...base, render });
    expect(a.state).toBe("MISS");
    resetPreviewCacheForTests(); // force the Redis path
    const b = await getOrRenderPreview({ ...base, render });
    expect(b.state).toBe("HIT");
    expect(Array.from(b.bytes)).toEqual([9]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("hits the in-process cache when Redis is disabled", async () => {
    redisOn = false;
    const render = vi.fn(async () => new Uint8Array([9]));
    expect((await getOrRenderPreview({ ...base, render })).state).toBe("BYPASS");
    expect((await getOrRenderPreview({ ...base, render })).state).toBe("HIT");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders without throwing when Redis errors", async () => {
    getThrows = true;
    const r = await getOrRenderPreview({ ...base, render: async () => new Uint8Array([5]) });
    expect(r.state).toBe("BYPASS");
    expect(Array.from(r.bytes)).toEqual([5]);
  });

  it("does not store oversized PDFs in Redis", async () => {
    await getOrRenderPreview({ ...base, render: async () => new Uint8Array(700 * 1024) });
    expect(store.size).toBe(0);
  });

  it("shares one render between 8 identical concurrent calls", async () => {
    const render = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return new Uint8Array([1]); });
    await Promise.all(Array.from({ length: 8 }, () => getOrRenderPreview({ ...base, render })));
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("when another worker holds the lock, returns the value once it appears without rendering", async () => {
    lockHeldByOther = true;
    const render = vi.fn(async () => new Uint8Array([1]));
    const key = previewCacheKey(base);
    setTimeout(() => store.set(`t:cache:invoice-preview:${key}`, Buffer.from([7, 7])), 200);
    const r = await getOrRenderPreview({ ...base, render });
    expect(r.state).toBe("HIT");
    expect(Array.from(r.bytes)).toEqual([7, 7]);
    expect(render).not.toHaveBeenCalled();
  });
});

describe("renderPreviewPdf", () => {
  it("never runs more than 2 renders at once", async () => {
    const gen = await import("@/lib/pdf/generator");
    let running = 0, peak = 0;
    vi.spyOn(gen, "generateInvoicePDF").mockImplementation(async () => {
      running += 1; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 15));
      running -= 1; return new Uint8Array([1]);
    });
    await Promise.all(Array.from({ length: 6 }, () => renderPreviewPdf(params)));
    expect(peak).toBe(2);
  });
});
