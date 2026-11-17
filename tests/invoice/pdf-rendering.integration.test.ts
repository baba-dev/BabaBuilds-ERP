import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFDict, PDFDocument, PDFName } from "pdf-lib";

import { drawInvoiceWatermark, generateInvoicePDF } from "@/lib/pdf/generator";
import { getInvoicePdfStoragePath } from "@/lib/invoice/pdf-storage";

const countPages = async (pdfBytes: Uint8Array) => {
  const doc = await PDFDocument.load(pdfBytes);
  return doc.getPageCount();
};

const makeTempUploadsRoot = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "invoice-pdf-test-"));
  process.env.PRIVATE_UPLOADS_DIR = dir;
  return dir;
};

const writeTinyPng = async (targetPath: string) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  // 1x1 transparent PNG
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9x0AAAAASUVORK5CYII=";
  await fs.writeFile(targetPath, Buffer.from(pngBase64, "base64"));
};

const writeTinyWebp = async (targetPath: string) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const webpBase64 = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAkA4JaQAA3AA/vuUAAA=";
  await fs.writeFile(targetPath, Buffer.from(webpBase64, "base64"));
};

const defaultParams = () => ({
  profile: {
    companyName: "Workspace Corp",
    address: "Street 1, City",
    bankName: "Bank",
    accountName: "Workspace Corp",
    accountNumber: "123456",
    ifscCode: "IFSC1234",
    workspace: {
      planTier: "PRO",
      subscriptionStatus: "ACTIVE",
      baseCurrency: "INR",
      countryCode: "IN",
    },
  },
  client: {
    name: "Client Co",
    address: "Client Street, Client City",
    country: "IN",
    isExport: false,
  },
  invoiceNumber: "INV/26-27/999",
  date: new Date("2026-04-27T00:00:00.000Z"),
  dueDate: new Date("2026-05-04T00:00:00.000Z"),
  billingMonth: "April 2026",
  sacCode: "998313",
  services: [{ title: "Consulting", nicDetails: "Monthly", amount: 1000 }],
  totals: { subtotal: 1000, taxRate: 0.18, taxAmount: 180, total: 1180, taxMode: "taxable" as const },
  formattedTotal: "1,180.00",
  baseCurrency: "INR",
  userLocale: "en-IN",
});

describe("pdf rendering integration", () => {
  it("generateInvoicePDF embeds payment link annotation and logos/signature images", async () => {
    const root = await makeTempUploadsRoot();
    const workspaceId = "ws-test";
    const logoPath = path.join(root, "logos", `${workspaceId}.png`);
    const clientLogoPath = path.join(root, "logos", "client-logo.png");
    const signaturePath = path.join(root, "signatures", `${workspaceId}.png`);
    await writeTinyPng(logoPath);
    await writeTinyPng(clientLogoPath);
    await writeTinyPng(signaturePath);

    const pdfBytes = await generateInvoicePDF({
      ...defaultParams(),
      paymentLink: "https://rzp.io/i/test-link",
      profile: {
        ...defaultParams().profile,
        logoUrl: `/logos/${workspaceId}.png`,
        signatureUrl: `/signatures/${workspaceId}.png`,
      },
      client: {
        ...defaultParams().client,
        logoUrl: "/logos/client-logo.png",
      },
    });

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];
    const annots = page.node.get(PDFName.of("Annots"));
    expect(annots).toBeTruthy();

    const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
    const xObject = resources?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObject).toBeTruthy();
  });

  it("generateInvoicePDF loads webp workspace logo without falling back", async () => {
    const root = await makeTempUploadsRoot();
    const workspaceId = "ws-test-webp";
    const logoPath = path.join(root, "logos", workspaceId, "logo.webp");
    await writeTinyWebp(logoPath);

    const pdfBytes = await generateInvoicePDF({
      ...defaultParams(),
      profile: {
        ...defaultParams().profile,
        logoUrl: `/logos/${workspaceId}/logo.webp`,
      },
    });

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];
    const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
    const xObject = resources?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObject).toBeTruthy();
  });

  it("generateInvoicePDF loads logo with absolute URL starting with http/https", async () => {
    const root = await makeTempUploadsRoot();
    const workspaceId = "ws-test-absolute";
    const logoPath = path.join(root, "logos", workspaceId, "logo.png");
    await writeTinyPng(logoPath);

    const pdfBytes = await generateInvoicePDF({
      ...defaultParams(),
      profile: {
        ...defaultParams().profile,
        logoUrl: `https://erp.bababuilds.com/logos/${workspaceId}/logo.png?t=123456`,
      },
    });

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];
    const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
    const xObject = resources?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xObject).toBeTruthy();
  });

  it("generateInvoicePDF creates multipage output for many DESIGN_1 items", async () => {
    const services = Array.from({ length: 48 }, (_, idx) => ({
      title: `Long consulting line item ${idx + 1} for pagination validation`,
      nicDetails: "Monthly",
      amount: 1000 + idx,
    }));
    const subtotal = services.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + taxAmount;
    const pdfBytes = await generateInvoicePDF({
      ...defaultParams(),
      services,
      totals: { subtotal, taxRate: 0.18, taxAmount, total, taxMode: "taxable" },
      formattedTotal: total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      profile: {
        ...defaultParams().profile,
        invoiceTheme: "DESIGN_1",
      },
    });

    const pageCount = await countPages(pdfBytes);
    expect(pageCount).toBeGreaterThan(1);
  });

  it("generateInvoicePDF creates multipage output for many DESIGN_2 items", async () => {
    const services = Array.from({ length: 48 }, (_, idx) => ({
      title: `Long consulting line item ${idx + 1} for pagination validation`,
      nicDetails: "Monthly",
      amount: 1000 + idx,
    }));
    const subtotal = services.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
    const total = subtotal + taxAmount;
    const pdfBytes = await generateInvoicePDF({
      ...defaultParams(),
      services,
      totals: { subtotal, taxRate: 0.18, taxAmount, total, taxMode: "taxable" },
      formattedTotal: total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      profile: {
        ...defaultParams().profile,
        invoiceTheme: "DESIGN_2",
      },
    });

    const pageCount = await countPages(pdfBytes);
    expect(pageCount).toBeGreaterThan(1);
  });

  it("drawInvoiceWatermark keeps PARTIAL stamp within page bounds", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const fontBold = await doc.embedFont("Helvetica-Bold");

    const placement = drawInvoiceWatermark(page, fontBold, "PARTIAL");
    expect(placement).toBeTruthy();
    expect(placement!.x).toBeGreaterThanOrEqual(0);
    expect(placement!.x + placement!.renderedWidth).toBeLessThanOrEqual(page.getSize().width);
  });

  it("getInvoicePdfStoragePath resolves private_uploads invoice path", () => {
    process.env.PRIVATE_UPLOADS_DIR = "/tmp/private-root";
    const fullPath = getInvoicePdfStoragePath({
      workspaceId: "ws_123",
      invoiceNumber: "INV/26-27/001",
      pdfPath: "/invoices/ws_123/INV_26-27_001.pdf",
    });

    expect(fullPath).toEqual(path.join("/tmp/private-root", "invoices", "ws_123", "INV_26-27_001.pdf"));
  });

  it("does not use a persisted PDF path from another workspace", () => {
    process.env.PRIVATE_UPLOADS_DIR = "/tmp/private-root";
    const got = getInvoicePdfStoragePath({
      workspaceId: "ws_a", invoiceNumber: "INV/26-27/002",
      pdfPath: "/invoices/ws_b/other-company.pdf",
    });
    expect(got).toBe(path.join("/tmp/private-root", "invoices", "ws_a", "INV_26-27_002.pdf"));
  });

  it.each([
    "/invoices/ws_a/../../secrets.pdf",
    "/invoices/ws_a/./untrusted.pdf",
    "/invoices/ws_a/a\\\\b.pdf",
  ])("ignores an unsafe persisted PDF path (%s)", (pdfPath) => {
    process.env.PRIVATE_UPLOADS_DIR = "/tmp/private-root";
    expect(getInvoicePdfStoragePath({
      workspaceId: "ws_a", invoiceNumber: "INV/26-27/003", pdfPath,
    })).toBe(path.join("/tmp/private-root", "invoices", "ws_a", "INV_26-27_003.pdf"));
  });
});
