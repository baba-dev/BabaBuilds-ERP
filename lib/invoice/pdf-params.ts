import { isStateCode } from "@/lib/gst/states";
import { resolveTreatment, type ClientGstDefaults, type InvoiceGstOverrides } from "@/lib/gst/source";
import type { PDFLine } from "@/lib/invoice/build-invoice-view-model";
import type { GstInput } from "@/lib/invoice/gst-breakdown";
import { normalizePayeeName, normalizeUpiVpa } from "@/lib/invoice/upi";

type ServiceLike = {
  title: string;
  amount: number;
  quantity?: number;
  unitPrice?: number | string;
  taxRate?: number | null;
  sacCode?: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Line items for the renderer, from the services the composer sent. Quantity defaults to 1. */
export const toPdfLines = (services: ServiceLike[], fallbackSac: string | null): PDFLine[] =>
  services.map((s) => {
    const quantity = Number.isFinite(s.quantity) && (s.quantity as number) > 0 ? (s.quantity as number) : 1;
    const parsedUnit = typeof s.unitPrice === "string" ? Number(s.unitPrice) : s.unitPrice;
    const unitPrice = Number.isFinite(parsedUnit) && (parsedUnit as number) >= 0 ? (parsedUnit as number) : round2(s.amount / quantity);
    return {
      description: s.title,
      quantity,
      unitPrice,
      amount: s.amount,
      taxRate: s.taxRate ?? null,
      sacCode: s.sacCode || fallbackSac || null,
    };
  });

/** GST treatment shown on the invoice: the invoice's own choices, then the client's standing treatment and state. */
export const toPdfGst = (
  client: ClientGstDefaults & { gstStateCode?: string | null },
  overrides: InvoiceGstOverrides | null | undefined,
): GstInput => {
  const t = resolveTreatment(client, overrides);
  const clientState = isStateCode(client.gstStateCode) ? client.gstStateCode : null;
  return {
    placeOfSupply: t.placeOfSupply ?? clientState,
    supplyOverride: t.supplyOverride,
    reverseCharge: t.reverseCharge,
  };
};

/** Only these designs draw UPI / uploaded QR codes, so only they pay for loading them. */
export const designUsesPaymentQrs = (theme: string | null | undefined): boolean => theme === "DESIGN_4" || theme === "DESIGN_8";

/** UPI ID and uploaded QR images for the renderer. An invalid UPI ID is ignored; images keep their order, at most three. */
export const toPdfPaymentQrs = (
  profile: { upiVpa?: string | null; upiPayeeName?: string | null },
  images: Array<{ label: string; imagePath: string; sortOrder: number }>,
): { upi: { vpa: string; payeeName: string | null } | undefined; staticQrs: Array<{ label: string; imagePath: string }> } => {
  const vpa = normalizeUpiVpa(profile.upiVpa);
  return {
    upi: vpa ? { vpa, payeeName: normalizePayeeName(profile.upiPayeeName) } : undefined,
    staticQrs: [...images].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 3).map((q) => ({ label: q.label, imagePath: q.imagePath })),
  };
};
