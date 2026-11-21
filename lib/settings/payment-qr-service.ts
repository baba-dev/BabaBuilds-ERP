import "server-only";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { buildPrivatePath } from "@/lib/uploads/private-storage";
import { MAX_PAYMENT_QR_IMAGES, storePaymentQrImage } from "@/lib/settings/payment-qr";

export type PaymentQrItem = { id: string; label: string; imageUrl: string };
type Failure = { ok: false; status: number; error: string; code: string };

const normalizeLabel = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const value = input.replace(/\s+/g, " ").trim();
  return value.length >= 1 && value.length <= 30 ? value : null;
};

/** Stores an uploaded QR image and lists it for the workspace. At most three per workspace. */
export async function addPaymentQr(workspaceId: string, label: unknown, file: File): Promise<{ ok: true; item: PaymentQrItem } | Failure> {
  const name = normalizeLabel(label);
  if (!name) return { ok: false, status: 400, error: "Give the QR a short label, such as Paytm or GPay.", code: "LABEL_REQUIRED" };
  const existing = await prisma.paymentQrImage.count({ where: { workspaceId } });
  if (existing >= MAX_PAYMENT_QR_IMAGES) return { ok: false, status: 409, error: `You can upload up to ${MAX_PAYMENT_QR_IMAGES} QR images. Remove one first.`, code: "MAX_QR_IMAGES" };
  const stored = await storePaymentQrImage(workspaceId, name, file);
  if (!stored.ok) return { ok: false, status: 400, error: stored.error, code: "FILE_REJECTED" };
  const row = await prisma.paymentQrImage.create({ data: { workspaceId, label: name, imagePath: stored.path, sortOrder: existing } });
  return { ok: true, item: { id: row.id, label: row.label, imageUrl: row.imagePath } };
}

/** Removes one of the workspace's own QR images and its file. Another workspace's id is a plain 404. */
export async function removePaymentQr(workspaceId: string, id: unknown): Promise<{ ok: true } | Failure> {
  if (typeof id !== "string" || !id) return { ok: false, status: 400, error: "Choose a QR image to remove.", code: "INVALID_BODY" };
  const row = await prisma.paymentQrImage.findFirst({ where: { id, workspaceId } });
  if (!row) return { ok: false, status: 404, error: "That QR image was not found.", code: "NOT_FOUND" };
  await prisma.paymentQrImage.deleteMany({ where: { id, workspaceId } });
  try {
    await fs.promises.unlink(buildPrivatePath("payment-qr", [workspaceId, path.basename(row.imagePath)]));
  } catch {
    // The row is gone; a missing file is not worth failing the request for.
  }
  return { ok: true };
}

export async function listPaymentQrs(workspaceId: string): Promise<PaymentQrItem[]> {
  const rows = await prisma.paymentQrImage.findMany({ where: { workspaceId }, orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({ id: r.id, label: r.label, imageUrl: r.imagePath }));
}
