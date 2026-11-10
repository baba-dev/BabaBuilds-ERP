import "server-only";
import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { PRESET_CATEGORIES } from "./categories";
import { parseAmount } from "./validate";

export type ScanResult = {
  vendor: string; amount: number | ""; date: string; category: string; description: string;
  gst: { itcStatus: "ELIGIBLE" | "INELIGIBLE" | "NONE"; vendorGstin: string; vendorInvoiceNo: string; hsnCode: string; gstRate: number } | null;
};
export type ScanFailure = { ok: false; status: number; code: string; message: string };

const VISION_MODEL = () => process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const TEXT_MODEL = () => process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";

const PROMPT = `You are a data extraction assistant for a small-business accounting app.
Read the bill or receipt and respond with strictly valid JSON:
{"vendor": string|null, "amount": number|null (final total paid, no symbols), "date": "YYYY-MM-DD"|null, "category": one of ${PRESET_CATEGORIES.map((c) => `"${c.value}"`).join(", ")},
"description": string (3-6 words), "vendorGstin": string|null (the supplier's 15-character GSTIN), "invoiceNumber": string|null, "hsnCode": string|null (digits only), "gstRate": number|null (overall GST rate in percent, null if no GST is shown)}
Use null for anything you cannot find. Never break the JSON.`;

export async function workspaceGroqKey(workspaceId: string): Promise<string | null> {
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { groqApiKey: true } });
  const enc = profile?.groqApiKey;
  if (!enc) return null;
  try { return decrypt(enc) || null; } catch { return enc; }
}

/** Text out of a PDF bill. Scanned (image-only) PDFs have none, which the caller reports as "photograph it instead". */
export async function pdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try { return (await parser.getText()).text ?? ""; } finally { await parser.destroy().catch(() => undefined); }
}

export function shapeScan(raw: Record<string, unknown>): ScanResult {
  const gstin = normalizeGstin(typeof raw.vendorGstin === "string" ? raw.vendorGstin : "");
  const gstinValid = gstin.length === 15 && validateGstin(gstin).valid;
  const rateNum = Number(raw.gstRate);
  const rate = Number.isFinite(rateNum) && rateNum > 0 && rateNum <= 40 ? rateNum : null;
  const known = PRESET_CATEGORIES.some((c) => c.value === raw.category);
  const category = known ? (raw.category as string) : "Other";
  const blocked = category === "Meals & Entertainment"; // food and entertainment credit is blocked under section 17(5)
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(new Date(raw.date).getTime()) ? raw.date : new Date().toISOString().slice(0, 10);
  return {
    vendor: typeof raw.vendor === "string" ? raw.vendor.slice(0, 120) : "", amount: parseAmount(raw.amount) ?? "", date, category,
    description: typeof raw.description === "string" ? raw.description.slice(0, 120) : "",
    gst: rate ? { itcStatus: blocked ? "INELIGIBLE" : gstinValid ? "ELIGIBLE" : "NONE", vendorGstin: gstinValid ? gstin : "", vendorInvoiceNo: typeof raw.invoiceNumber === "string" ? raw.invoiceNumber.slice(0, 60) : "", hsnCode: typeof raw.hsnCode === "string" ? raw.hsnCode.replace(/\D/g, "").slice(0, 8) : "", gstRate: rate } : null,
  };
}

/** Reads a receipt: images with the vision model, PDFs by extracting their text first. */
export async function scanReceipt(args: { apiKey: string; buffer: Buffer; kind: "png" | "jpeg" | "webp" | "pdf" }): Promise<{ ok: true; data: ScanResult } | ScanFailure> {
  const groq = new Groq({ apiKey: args.apiKey });
  try {
    let content: string;
    if (args.kind === "pdf") {
      const text = (await pdfText(args.buffer)).trim();
      if (text.length < 20) return { ok: false, status: 422, code: "PDF_NO_TEXT", message: "This PDF is a scan with no readable text. Photograph the bill and upload the image instead." };
      const completion = await groq.chat.completions.create({ model: TEXT_MODEL(), temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "user", content: `${PROMPT}\n\nBill text:\n${text.slice(0, 12000)}` }] });
      content = completion.choices[0]?.message?.content || "{}";
    } else {
      const url = `data:image/${args.kind};base64,${args.buffer.toString("base64")}`;
      const completion = await groq.chat.completions.create({ model: VISION_MODEL(), temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url } }] }] });
      content = completion.choices[0]?.message?.content || "{}";
    }
    return { ok: true, data: shapeScan(JSON.parse(content) as Record<string, unknown>) };
  } catch (error) {
    console.error("Receipt scan failed:", error);
    return { ok: false, status: 502, code: "SCAN_FAILED", message: "The receipt could not be read. Check the details by hand." };
  }
}
