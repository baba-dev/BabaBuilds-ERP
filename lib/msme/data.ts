import { prisma } from "@/lib/prisma";
import { fyBounds, fyStartYear } from "@/lib/ca/fy";
import { loadGstProfile } from "@/lib/gst/data";
import { MSME_RULES } from "./rules";
import { classifyMsme, udyamState, validateUdyam } from "./udyam";
import { compositionView, gstThresholdView, type SupplyKind } from "./threshold";
import { msmePayables } from "./payables";

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Everything the small-business panel needs, derived from the books on each call (nothing is stored but the owner's own settings). */
export async function loadSmallBusiness(workspaceId: string, now = new Date()) {
  const gst = await loadGstProfile(workspaceId);
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId }, select: { udyamNumber: true, gstSupplyKind: true, msmeInvestment: true, gstPrevFyTurnover: true } });
  const startYear = fyStartYear(now);
  const { start, end } = fyBounds(startYear);
  const kind = (["GOODS", "BOTH"].includes(profile?.gstSupplyKind ?? "") ? profile?.gstSupplyKind : "SERVICES") as SupplyKind;

  const [invoices, bills] = await Promise.all([
    prisma.invoice.findMany({ where: { workspaceId, voidedAt: null, invoiceDate: { gte: start, lt: end } }, select: { invoiceDate: true, subtotal: true, exchangeRate: true } }),
    prisma.expense.findMany({ where: { workspaceId, vendorMsme: { in: ["MICRO", "SMALL"] }, date: { lt: end } }, select: { id: true, vendor: true, date: true, amount: true, paymentStatus: true, paidAt: true, vendorMsme: true, vendorUdyam: true, vendorAgreedDays: true }, orderBy: { date: "desc" }, take: 500 }),
  ]);

  const points = invoices.map((i) => ({ date: i.invoiceDate, amount: num(i.subtotal) * (num(i.exchangeRate) > 0 ? num(i.exchangeRate) : 1) }));
  const registered = gst.registrationType !== "UNREGISTERED";
  const threshold = gstThresholdView({ registered, countryIsIndia: gst.countryCode === "IN", kind, stateCode: gst.stateCode, points, fyStart: start, now });
  const prevTurnover = num(profile?.gstPrevFyTurnover) || threshold.turnover;
  const composition = compositionView({ kind, stateCode: gst.stateCode, prevTurnover });
  const udyam = validateUdyam(profile?.udyamNumber);
  const investment = profile?.msmeInvestment === null || profile?.msmeInvestment === undefined ? null : num(profile.msmeInvestment);
  const classification = classifyMsme({ turnover: Math.max(prevTurnover, threshold.turnover), investment });
  const payables = msmePayables(
    bills.map((b) => ({ id: b.id, vendor: b.vendor, date: b.date, amount: num(b.amount), paid: b.paymentStatus === "PAID", paidAt: b.paidAt, vendorMsme: b.vendorMsme, vendorUdyam: b.vendorUdyam, agreedDays: b.vendorAgreedDays })),
    now,
    new Date(end.getTime() - 1),
  );

  return {
    fy: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    applicable: gst.countryCode === "IN",
    registrationType: gst.registrationType,
    supplyKind: kind,
    stateCode: gst.stateCode,
    threshold,
    composition,
    udyam: { number: udyam.value || null, valid: udyam.valid, state: udyam.valid ? udyamState(udyam.value) : null, reason: udyam.reason ?? null },
    classification: { ...classification, investment },
    payables: { unpaidPastDue: payables.unpaidPastDue, unpaidPastDueAmount: payables.unpaidPastDueAmount, paidLate: payables.paidLate, rows: payables.rows.filter((r) => r.state !== "OK").slice(0, 20) },
    rules: { applyWithinDays: MSME_RULES.gst.applyWithinDays, paymentDays: MSME_RULES.payment.maxDays },
  };
}

export type SmallBusinessStatus = Awaited<ReturnType<typeof loadSmallBusiness>>;
