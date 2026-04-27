import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

import { applyInvoiceStatusStamp } from "@/lib/invoice/pdf-stamp";

const makePdf = async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  page.drawText("Invoice body", { x: 40, y: 760 });
  return doc.save();
};

describe("applyInvoiceStatusStamp", () => {
  it("applies PARTIALLY PAID watermark text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-stamp-partial-"));
    const filePath = path.join(dir, "invoice.pdf");
    await fs.writeFile(filePath, await makePdf());

    await applyInvoiceStatusStamp({
      filePath,
      stampLabel: "PARTIALLY PAID",
    });

    const stamped = await fs.readFile(filePath);
    const reloaded = await PDFDocument.load(stamped);
    expect(reloaded.getTitle()).toBe("STAMP:PARTIALLY PAID");
  });

  it("applies PAID + received date text", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-stamp-paid-"));
    const filePath = path.join(dir, "invoice.pdf");
    await fs.writeFile(filePath, await makePdf());

    await applyInvoiceStatusStamp({
      filePath,
      stampLabel: "PAID",
      receivedDateText: "27 APR 2026",
    });

    const stamped = await fs.readFile(filePath);
    const reloaded = await PDFDocument.load(stamped);
    expect(reloaded.getTitle()).toBe("STAMP:PAID");
    expect(reloaded.getSubject()).toBe("RECEIVED:27 APR 2026");
  });
});
