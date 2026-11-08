import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gstError, requireGstAccess } from "@/lib/gst/access";
import { loadGstProfile } from "@/lib/gst/data";
import { previewGst, type SourceLine } from "@/lib/gst/source";
import { FOREIGN_POS, isStateCode } from "@/lib/gst/states";
import { normalizeTaxRate } from "@/lib/invoice/tax-resolver";

const bodySchema = z.object({
  clientId: z.string().min(1).optional(),
  /** For a customer who is not saved yet (e.g. a new client typed into a proposal). */
  party: z.object({ country: z.string().max(60).nullish(), gstin: z.string().max(20).nullish(), stateCode: z.string().max(2).nullish() }).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().max(300).optional(),
        amount: z.number().finite().min(0),
        quantity: z.number().finite().min(0).optional(),
        /** Percent; omit to use the rate of the SAC code, then the workspace default. */
        ratePercent: z.number().finite().min(0).max(100).nullish(),
        sacCode: z.string().max(20).nullish(),
        goods: z.boolean().optional(),
        /** A stock item: its HSN and rate come from the product master. */
        productId: z.string().max(40).nullish(),
        /** A catalogue service: its SAC code and rate come from the service. */
        serviceTemplateId: z.string().max(40).nullish(),
      }),
    )
    .max(200),
  overrides: z
    .object({
      placeOfSupply: z.string().max(2).nullish().refine((v) => !v || v === FOREIGN_POS || isStateCode(v), "Unknown place of supply"),
      supplyOverride: z.enum(["SEZ_WP", "SEZ_WOP"]).nullish(),
      reverseCharge: z.boolean().nullish(),
    })
    .optional(),
  exchangeRate: z.number().finite().positive().optional(),
});

/** Live GST treatment for a sale being typed: place of supply, CGST/SGST/IGST and the warnings worth acting on. */
export async function POST(request: Request) {
  const auth = await requireGstAccess("clients.view");
  if (!auth.ok) return auth.response;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return gstError(400, "INVALID_BODY", body.error.issues[0]?.message ?? "Check the lines.");
  const b = body.data;
  const { workspaceId } = auth.access;

  const [profile, client, settings] = await Promise.all([
    loadGstProfile(workspaceId),
    b.clientId
      ? prisma.client.findFirst({ where: { id: b.clientId, workspaceId }, select: { country: true, taxId: true, gstStateCode: true, gstSupplyOverride: true, gstReverseCharge: true, isExport: true } })
      : Promise.resolve(null),
    prisma.businessProfile.findUnique({ where: { workspaceId }, select: { defaultTaxRate: true } }),
  ]);
  if (b.clientId && !client) return gstError(404, "NOT_FOUND", "Client not found.");

  const applicable = profile.countryCode === "IN" && profile.registrationType !== "UNREGISTERED";
  if (!applicable) return NextResponse.json({ preview: previewGst({ supplierState: profile.stateCode, applicable: false, party: { country: null, gstin: null, stateCode: null }, lines: [], defaultRate: 0 }) });

  const productIds = Array.from(new Set(b.lines.map((l) => l.productId).filter((id): id is string => !!id)));
  const products = productIds.length ? await prisma.product.findMany({ where: { workspaceId, id: { in: productIds } }, select: { id: true, hsnCode: true, gstRate: true } }) : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const serviceIds = Array.from(new Set(b.lines.map((l) => l.serviceTemplateId).filter((id): id is string => !!id)));
  const services = serviceIds.length ? await prisma.serviceTemplate.findMany({ where: { workspaceId, id: { in: serviceIds } }, select: { id: true, sacCode: { select: { code: true, igstRate: true } } } }) : [];
  const serviceById = new Map(services.map((sv) => [sv.id, sv.sacCode]));

  const codes = Array.from(new Set(b.lines.map((l) => (l.sacCode ?? "").trim()).filter(Boolean)));
  const sacRows = codes.length ? await prisma.sACCode.findMany({ where: { code: { in: codes } }, select: { code: true, igstRate: true } }) : [];
  const sacRate = new Map(sacRows.map((r) => [r.code, r.igstRate]));
  const wsRate = normalizeTaxRate(settings?.defaultTaxRate);
  const defaultRate = wsRate !== null ? Math.round(wsRate * 10000) / 100 : 18;

  const lines: SourceLine[] = b.lines.map((l) => {
    const product = l.productId ? productById.get(l.productId) : undefined;
    const serviceSac = l.serviceTemplateId ? serviceById.get(l.serviceTemplateId) ?? null : null;
    const sacCode = product ? product.hsnCode : l.sacCode ?? serviceSac?.code ?? null;
    return {
      description: l.description,
      amount: l.amount,
      quantity: l.quantity,
      ratePercent: l.ratePercent ?? product?.gstRate ?? serviceSac?.igstRate ?? (sacCode ? sacRate.get(sacCode.trim()) ?? null : null),
      sacCode,
      goods: product ? true : l.goods,
    };
  });

  const party = client
    ? { country: client.country, gstin: client.taxId, stateCode: client.gstStateCode, gstSupplyOverride: client.gstSupplyOverride, gstReverseCharge: client.gstReverseCharge, taxExempt: Boolean(client.isExport) }
    : { country: b.party?.country ?? "IN", gstin: b.party?.gstin ?? null, stateCode: b.party?.stateCode ?? null };

  const preview = previewGst({ supplierState: profile.stateCode, applicable: true, party, lines, defaultRate, overrides: b.overrides, exchangeRate: b.exchangeRate });
  return NextResponse.json({ preview });
}
