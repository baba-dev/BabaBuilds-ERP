import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { MAX_PAYMENT_QR_IMAGES, storePaymentQrImage } from "@/lib/settings/payment-qr";

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "payment-qr-test-"));
  process.env.PRIVATE_UPLOADS_DIR = root;
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const png = (size: number, noise = false) =>
  sharp(noise ? { create: { width: size, height: size, channels: 3, background: "#fff", noise: { type: "gaussian", mean: 128, sigma: 80 } } } : { create: { width: size, height: size, channels: 3, background: "#fff" } }).png().toBuffer();
const file = (buf: Buffer, name: string) => new File([new Uint8Array(buf)], name);

describe("storePaymentQrImage", () => {
  it("allows three images per workspace", () => {
    expect(MAX_PAYMENT_QR_IMAGES).toBe(3);
  });

  it("stores a real image privately and re-encodes it to a bounded PNG", async () => {
    const result = await storePaymentQrImage("ws1", "Paytm", file(await png(1000), "paytm.png"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toMatch(/^\/payment-qr\/ws1\/[A-Za-z0-9._-]+\.png$/);
    const stored = await fs.readFile(path.join(root, "payment-qr", "ws1", path.basename(result.path)));
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeLessThanOrEqual(800);
  });

  it("rejects content that is not an image, whatever its name", async () => {
    const r = await storePaymentQrImage("ws1", "x", file(Buffer.from("hello world, not a png"), "qr.png"));
    expect(r.ok).toBe(false);
  });

  it("rejects SVG and other extensions", async () => {
    for (const name of ["qr.svg", "qr.gif", "qr.pdf", "qr"]) {
      const r = await storePaymentQrImage("ws1", "x", file(await png(100), name));
      expect(r.ok, name).toBe(false);
    }
  });

  it("rejects files over 1 MB", async () => {
    const big = await png(1200, true);
    expect(big.length).toBeGreaterThan(1024 * 1024);
    const r = await storePaymentQrImage("ws1", "x", file(big, "big.png"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/1 MB|large/i);
  });

  it("rejects images above 3000 px even when they are small on disk", async () => {
    const r = await storePaymentQrImage("ws1", "x", file(await png(3200), "huge.png"));
    expect(r.ok).toBe(false);
  });

  it("keeps each workspace in its own folder", async () => {
    const a = await storePaymentQrImage("wsA", "A", file(await png(100), "a.png"));
    const b = await storePaymentQrImage("wsB", "B", file(await png(100), "b.png"));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.path.split("/")[2]).not.toBe(b.path.split("/")[2]);
  });
});
