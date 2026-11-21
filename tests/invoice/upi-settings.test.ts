import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

import { bankingSchema } from "@/lib/settings/schemas";

type Row = { id: string; workspaceId: string; label: string; imagePath: string; sortOrder: number };
const rows: Row[] = [];
let nextId = 1;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentQrImage: {
      count: async ({ where }: { where: { workspaceId: string } }) => rows.filter((r) => r.workspaceId === where.workspaceId).length,
      create: async ({ data }: { data: Omit<Row, "id"> }) => { const row = { id: `q${nextId++}`, ...data }; rows.push(row); return row; },
      findMany: async ({ where }: { where: { workspaceId: string } }) => rows.filter((r) => r.workspaceId === where.workspaceId).sort((a, b) => a.sortOrder - b.sortOrder),
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => rows.find((r) => r.id === where.id && r.workspaceId === where.workspaceId) ?? null,
      deleteMany: async ({ where }: { where: { id: string; workspaceId: string } }) => {
        const i = rows.findIndex((r) => r.id === where.id && r.workspaceId === where.workspaceId);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
    },
  },
}));

import { addPaymentQr, removePaymentQr } from "@/lib/settings/payment-qr-service";

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "payment-qr-svc-"));
  process.env.PRIVATE_UPLOADS_DIR = root;
});
afterAll(async () => fs.rm(root, { recursive: true, force: true }));
beforeEach(() => { rows.length = 0; });

const png = async () => new File([new Uint8Array(await sharp({ create: { width: 120, height: 120, channels: 3, background: "#fff" } }).png().toBuffer())], "qr.png");

describe("banking schema UPI fields", () => {
  const base = { bankName: "HDFC", accountName: "Baba", ifscCode: "HDFC0001234" };

  it("normalises a valid UPI ID and payee, and clears on empty", () => {
    const ok = bankingSchema.parse({ ...base, upiVpa: " Shop@OKHDFC ", upiPayeeName: " Baba  Sons " });
    expect(ok.upiVpa).toBe("shop@okhdfc");
    expect(ok.upiPayeeName).toBe("Baba Sons");
    expect(bankingSchema.parse({ ...base, upiVpa: "", upiPayeeName: "" })).toMatchObject({ upiVpa: null, upiPayeeName: null });
    expect(bankingSchema.parse(base).upiVpa).toBeUndefined();
  });

  it("rejects junk", () => {
    expect(bankingSchema.safeParse({ ...base, upiVpa: "not a vpa" }).success).toBe(false);
    expect(bankingSchema.safeParse({ ...base, upiVpa: "javascript:alert(1)" }).success).toBe(false);
    expect(bankingSchema.safeParse({ ...base, upiPayeeName: "x".repeat(61) }).success).toBe(false);
  });
});

describe("payment QR images", () => {
  it("adds up to three and refuses the fourth", async () => {
    for (let i = 1; i <= 3; i += 1) {
      const r = await addPaymentQr("ws1", `QR ${i}`, await png());
      expect(r.ok, `add ${i}`).toBe(true);
    }
    const fourth = await addPaymentQr("ws1", "QR 4", await png());
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth).toMatchObject({ status: 409, code: "MAX_QR_IMAGES" });
    expect(rows.filter((r) => r.workspaceId === "ws1")).toHaveLength(3);
  });

  it("counts per workspace and keeps the order", async () => {
    await addPaymentQr("ws1", "A", await png());
    const b = await addPaymentQr("ws2", "B", await png());
    expect(b.ok).toBe(true);
    const second = await addPaymentQr("ws1", "C", await png());
    expect(second.ok && second.item.label).toBe("C");
    expect(rows.filter((r) => r.workspaceId === "ws1").map((r) => r.sortOrder)).toEqual([0, 1]);
  });

  it("requires a short label and a real image", async () => {
    expect((await addPaymentQr("ws1", "   ", await png())).ok).toBe(false);
    expect((await addPaymentQr("ws1", "x".repeat(31), await png())).ok).toBe(false);
    const bad = await addPaymentQr("ws1", "Fake", new File([new Uint8Array(Buffer.from("not an image"))], "qr.png"));
    expect(bad.ok).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("removes only the caller's own image and deletes its file", async () => {
    const added = await addPaymentQr("ws1", "Mine", await png());
    if (!added.ok) throw new Error("setup");
    const file = path.join(root, "payment-qr", "ws1", path.basename(added.item.imageUrl));
    await expect(fs.stat(file)).resolves.toBeTruthy();

    const other = await removePaymentQr("ws2", added.item.id);
    expect(other).toMatchObject({ ok: false, status: 404 });
    expect(rows).toHaveLength(1);

    const mine = await removePaymentQr("ws1", added.item.id);
    expect(mine.ok).toBe(true);
    expect(rows).toHaveLength(0);
    await expect(fs.stat(file)).rejects.toBeTruthy();
  });
});
