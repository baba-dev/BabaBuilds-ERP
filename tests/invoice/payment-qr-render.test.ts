import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { buildInvoiceViewModel } from "@/lib/invoice/build-invoice-view-model";
import { FIXTURE_QR_DIR_WORKSPACE, SAMPLE_INVOICES } from "@/lib/invoice-templates/fixtures/sample-invoices";
import { countRects, hasImage } from "./helpers/pdf-content";
import { renderFixture } from "./helpers/render";

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "qr-render-"));
  process.env.PRIVATE_UPLOADS_DIR = root;
  const dir = path.join(root, "payment-qr", FIXTURE_QR_DIR_WORKSPACE);
  await fs.mkdir(dir, { recursive: true });
  const png = await sharp({ create: { width: 160, height: 160, channels: 3, background: "#ffffff" } }).composite([{ input: await sharp({ create: { width: 80, height: 80, channels: 3, background: "#000000" } }).png().toBuffer(), left: 40, top: 40 }]).png().toBuffer();
  for (const name of ["paytm", "gpay", "phonepe", "bank"]) await fs.writeFile(path.join(dir, `${name}.png`), png);
});
afterAll(async () => fs.rm(root, { recursive: true, force: true }));

const vmOf = (key: string) => buildInvoiceViewModel(SAMPLE_INVOICES[key]);

describe("payment QR sources in the view model", () => {
  it("orders them: payment link, UPI, then uploaded images", () => {
    const sources = vmOf("linkUpiStatic").paymentQrs;
    expect(sources.map((s) => s.kind)).toEqual(["PAYMENT_LINK", "UPI", "STATIC_IMAGE", "STATIC_IMAGE"]);
    expect(sources[0]).toMatchObject({ url: "https://rzp.io/i/lus123" });
    expect(sources[1]).toMatchObject({ uri: "upi://pay?pa=shop%40okhdfc&pn=Baba%20%26%20Sons&am=18880.00&cu=INR&tn=INV%2F26-27%2F001" });
    expect(sources.slice(2).map((s) => ("label" in s ? s.label : ""))).toEqual(["Paytm", "GPay"]);
  });

  it("puts the net amount in the UPI link when TDS applies", () => {
    const uri = vmOf("tdsUpi").paymentQrs.find((s) => s.kind === "UPI");
    expect(uri && "uri" in uri ? uri.uri : "").toContain("am=17280.00");
  });

  it("allows at most three UPI or uploaded QRs", () => {
    const kinds = vmOf("manyStatic").paymentQrs.map((s) => s.kind);
    expect(kinds).toEqual(["UPI", "STATIC_IMAGE", "STATIC_IMAGE"]);
  });

  it("offers nothing to pay on a paid invoice, in a foreign currency, or with an invalid UPI ID", () => {
    expect(vmOf("paidUpi").paymentQrs).toEqual([]);
    expect(vmOf("usdUpi").paymentQrs.filter((s) => s.kind !== "PAYMENT_LINK")).toEqual([]);
    expect(vmOf("invalidUpi").paymentQrs).toEqual([]);
  });

  it("keeps the payment-link source unchanged", () => {
    expect(vmOf("unpaidWithLink").paymentQrs).toEqual([{ kind: "PAYMENT_LINK", url: "https://rzp.io/i/unpaid789", label: "Pay online" }]);
  });
});

describe("Pay-Fast with several payment QRs", () => {
  it("shows the link QR in the panel and the others under More ways to pay", async () => {
    const full = await renderFixture("linkUpiStatic", "DESIGN_4");
    for (const word of ["SCAN TO PAY", "MORE WAYS TO PAY", "UPI", "Paytm", "GPay", "Enter amount ₹18,880.00", "INV/26-27/001"]) expect(full.text).toContain(word);
    expect(await hasImage(full.bytes)).toBe(true);
    const linkOnly = await renderFixture("unpaidWithLink", "DESIGN_4");
    expect((await countRects(full.bytes)) - (await countRects(linkOnly.bytes))).toBeGreaterThan(20);
  });

  it("uses a UPI-only workspace's UPI QR as the main panel", async () => {
    const { text } = await renderFixture("upiOnly", "DESIGN_4");
    expect(text).toContain("SCAN TO PAY");
    expect(text).toContain("UPI · shop@okhdfc");
    expect(text).not.toContain("MORE WAYS TO PAY");
  });

  it("uses an uploaded image as the main panel when it is the only source", async () => {
    const { text, bytes } = await renderFixture("staticOnly", "DESIGN_4");
    expect(text).toContain("SCAN TO PAY");
    expect(text).toContain("Enter amount ₹18,880.00");
    expect(await hasImage(bytes)).toBe(true);
  });

  it("shows none of it on a paid invoice and skips a missing image file without failing", async () => {
    const paid = await renderFixture("paidUpi", "DESIGN_4");
    expect(paid.text).not.toContain("MORE WAYS TO PAY");
    expect(paid.text).not.toContain("SCAN TO PAY");
    const missing = await renderFixture("missingStaticFile", "DESIGN_4");
    expect(missing.text).not.toContain("MORE WAYS TO PAY");
    expect(missing.pages.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to bank details when the UPI ID is invalid", async () => {
    const { text } = await renderFixture("invalidUpi", "DESIGN_4");
    expect(text).not.toContain("SCAN TO PAY");
    expect(text).toContain("PAY BY BANK TRANSFER");
  });
});

describe("Receipt with payment QRs", () => {
  it("draws exactly one QR: the payment link first", async () => {
    const { text, bytes } = await renderFixture("linkUpiStatic", "DESIGN_8");
    expect((text.match(/Scan to pay/g) ?? []).length).toBe(1);
    expect(text).toContain("https://rzp.io/i/lus123");
    expect(text).not.toContain("UPI · shop@okhdfc");
    expect(await hasImage(bytes)).toBe(false);
  });

  it("uses the UPI QR when there is no payment link", async () => {
    const { text } = await renderFixture("upiOnly", "DESIGN_8");
    expect(text).toContain("Scan to pay ₹18,880.00");
    expect(text).toContain("UPI · shop@okhdfc");
  });

  it("uses an uploaded image last, with the amount to type", async () => {
    const { text, bytes } = await renderFixture("staticOnly", "DESIGN_8");
    expect(text).toContain("Enter ₹18,880.00");
    expect(text).toContain("INV/26-27/001");
    expect(await hasImage(bytes)).toBe(true);
  });

  it("draws nothing when paid or when nothing could be loaded", async () => {
    expect((await renderFixture("paidUpi", "DESIGN_8")).text).not.toContain("Scan to pay");
    const missing = await renderFixture("missingStaticFile", "DESIGN_8");
    expect(missing.text).not.toContain("Enter ₹");
  });
});
