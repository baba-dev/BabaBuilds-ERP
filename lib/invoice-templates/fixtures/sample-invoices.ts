import type { PDFLine, PDFParams } from "@/lib/invoice/build-invoice-view-model";
import { calculateInvoiceTotals } from "@/lib/invoice/totals";

const baseProfile: PDFParams["profile"] = {
  companyName: "BabaBuilds ERP Services Pvt Ltd",
  proprietorName: "A. Founder",
  address: "Tower 2, Main Street, Bengaluru, Karnataka, India 560001",
  taxIdLabel: "GSTIN",
  routingLabel: "IFSC Code",
  logoUrl: null,
  gstin: "29ABCDE1234F1Z9",
  email: "billing@bababuilds.com",
  phone: "+91-90000-00000",
  website: "erp.bababuilds.com",
  udyamNumber: "UDYAM-KR-00-1234567",
  panNumber: "ABCDE1234F",
  gstStateCode: "29",
  bankName: "HDFC Bank",
  accountName: "BabaBuilds ERP Services Pvt Ltd",
  accountNumber: "1234567890",
  ifscCode: "HDFC0001234",
  signatureUrl: null,
  invoiceTheme: "DESIGN_1",
  taxLabel: "GST",
  workspace: {
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
    countryCode: "IN",
    baseCurrency: "INR",
  },
};

const baseClient: PDFParams["client"] = {
  name: "Acme Industries",
  address: "42 Client Park, Mumbai, Maharashtra, India",
  country: "IN",
  email: "ap@acme.com",
  taxId: "27AAAAA0000A1Z5",
  isExport: false,
  logoUrl: null,
};

const makeServices = (count = 2) =>
  Array.from({ length: count }, (_, idx) => ({
    title: `Engineering Service #${idx + 1}`,
    nicDetails: "Monthly scope",
    amount: 5000 + idx * 100,
  }));

const makeParams = (
  overrides: Partial<PDFParams> = {},
  serviceCount = 2,
  taxExempt = false,
): PDFParams => {
  const services = overrides.services ?? makeServices(serviceCount);
  const totals = calculateInvoiceTotals({
    services,
    isTaxExempt: taxExempt,
    defaultTaxRate: 0.18,
  });
  return {
    profile: { ...baseProfile },
    client: { ...baseClient, isExport: taxExempt },
    invoiceNumber: "INV/26-27/001",
    date: new Date("2026-04-27T00:00:00.000Z"),
    dueDate: new Date("2026-05-04T00:00:00.000Z"),
    billingMonth: "April 2026",
    sacCode: "998313",
    services,
    totals,
    formattedTotal: totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    baseCurrency: "INR",
    userLocale: "en-IN",
    paymentLink: null,
    status: "PENDING",
    ...overrides,
  };
};

/** Builds params from detailed lines so totals, services and lines always agree. */
const makeLineParams = (lines: PDFLine[], overrides: Partial<PDFParams> = {}, taxExempt = false): PDFParams => {
  const services = lines.map((l) => ({ title: l.description, nicDetails: l.note ?? "", amount: l.amount, sacCode: l.sacCode ?? null }));
  const totals = calculateInvoiceTotals({
    services: lines.map((l) => ({ amount: l.amount, taxRate: l.taxRate ?? 0.18 })),
    isTaxExempt: taxExempt,
    defaultTaxRate: 0.18,
  });
  return makeParams({
    services,
    lines,
    totals,
    formattedTotal: totals.total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ...overrides,
  }, lines.length, taxExempt);
};

const gstLines: PDFLine[] = [
  { description: "ERP implementation", note: "Discovery, configuration and training", quantity: 2, unitPrice: 2500, amount: 5000, taxRate: 0.18, sacCode: "998313" },
  { description: "Annual support", note: "Priority email and phone support", quantity: 1, unitPrice: 12000, discountAmount: 1000, amount: 11000, taxRate: 0.18, sacCode: "998313" },
];

const projectLines: PDFLine[] = [
  { description: "Discovery workshop", note: "Two-day on-site session with stakeholders", quantity: 1, unitPrice: 4000, amount: 4000, taxRate: 0.18, sacCode: "998313", section: "Phase 1: Discovery" },
  { description: "Requirements document", quantity: 1, unitPrice: 6500, discountAmount: 500, amount: 6000, taxRate: 0.18, sacCode: "998313", section: "Phase 1: Discovery" },
  { description: "Development", note: "Hourly, as per timesheet", quantity: 40, unitPrice: 150, amount: 6000, taxRate: 0.18, sacCode: "998314", section: "Phase 2: Build" },
  { description: "QA and handover", quantity: 1, unitPrice: 2000, amount: 2000, taxRate: 0.18, sacCode: "998314", section: "Phase 2: Build" },
];

const mixedRateLines: PDFLine[] = [
  { description: "Consulting", quantity: 1, unitPrice: 100.01, amount: 100.01, taxRate: 0.18, sacCode: "998311" },
  { description: "Printed manuals", quantity: 3, unitPrice: 16.677, amount: 50.03, taxRate: 0.05, sacCode: "4901" },
  { description: "Courier", quantity: 1, unitPrice: 0.01, amount: 0.01, taxRate: 0.12, sacCode: "996812" },
  { description: "Workshop", quantity: 1, unitPrice: 33.33, amount: 33.33, taxRate: 0.18, sacCode: "999293" },
];

export const SAMPLE_INVOICES: Record<string, PDFParams> = {
  basic: makeParams(),
  taxExemptExport: makeParams({
    client: {
      ...baseClient,
      country: "United States",
      address: "500 Market Street, Suite 900, San Francisco, CA, USA",
      isExport: true,
      taxId: null,
    },
    profile: {
      ...baseProfile,
      workspace: {
        ...baseProfile.workspace!,
        countryCode: "US",
        baseCurrency: "USD",
      },
      taxLabel: "Sales Tax",
      taxIdLabel: "EIN",
      routingLabel: "ABA",
    },
    baseCurrency: "USD",
    userLocale: "en-US",
    paymentLink: "https://pay.example.com/invoice/INV-001",
  }, 2, true),
  longStrings: makeParams({
    profile: {
      ...baseProfile,
      companyName: "BabaBuilds Enterprise Resource Planning and Business Intelligence Consulting Company Private Limited",
      address: "Block C, 17th Floor, International Tech Park, Whitefield Main Road, Bengaluru, Karnataka, India, Postal Code 560066, Landmark Near Metro Gate 4",
    },
    client: {
      ...baseClient,
      name: "Global Conglomerate for Infrastructure Development and Advanced Manufacturing Limited",
      address: "Level 24, Infinity Corporate Centre, Long Avenue Name, Business District, Metropolitan City, Country",
    },
    services: [
      {
        title: "End-to-end strategic transformation advisory for multi-country ERP modernization and process optimization roadmap",
        nicDetails: "Quarterly consulting cycle",
        amount: 25000,
      },
    ],
    paymentLink: "https://rzp.io/i/very-long-payment-link-for-visual-wrapping-validation-example-1234567890",
  }),
  manyItems: makeParams({}, 40, false),
  missingLogo: makeParams({
    profile: { ...baseProfile, logoUrl: null },
    client: { ...baseClient, logoUrl: null },
  }),
  missingBankDetails: makeParams({
    profile: {
      ...baseProfile,
      bankName: "",
      accountName: "",
      accountNumber: "",
      ifscCode: "",
      primaryBankAccount: null,
    },
  }),
  paid: makeParams({ status: "PAID" }),
  partiallyPaid: makeParams({ status: "PARTIALLY_PAID" }),
  gstIntra: makeLineParams(gstLines, {
    client: { ...baseClient, gstStateCode: "29", address: "12 MG Road, Bengaluru, Karnataka, India" },
    gst: { placeOfSupply: "29" },
  }),
  gstInter: makeLineParams(gstLines, {
    client: { ...baseClient, gstStateCode: "27" },
    gst: { placeOfSupply: "27", irn: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90", irnAckNo: "112610000012345", irnAckDate: new Date("2026-04-27T00:00:00.000Z") },
  }),
  mixedRates: makeLineParams(mixedRateLines, { gst: { placeOfSupply: "29" } }),
  emptyLines: makeLineParams([], { gst: { placeOfSupply: "29" } }),
  zeroTotal: makeLineParams([{ description: "Complimentary onboarding", quantity: 1, unitPrice: 0, amount: 0, taxRate: 0.18 }], { gst: { placeOfSupply: "29" } }),
  devanagariClient: makeLineParams(gstLines, {
    client: { ...baseClient, name: "शर्मा ट्रेडर्स प्राइवेट लिमिटेड", address: "४२ गांधी रोड, मुंबई, महाराष्ट्र" },
    gst: { placeOfSupply: "27" },
  }),
  manyLines: makeLineParams(
    Array.from({ length: 200 }, (_, i): PDFLine => ({
      description: i === 3 ? "https://example.com/a-very-long-unbroken-reference/path/with/many/segments/that/cannot/wrap/naturally/0123456789" : `Line item ${i + 1}`,
      note: i % 10 === 0 ? "Includes setup and handover" : null,
      quantity: 1 + (i % 4),
      unitPrice: 100 + i,
      amount: (1 + (i % 4)) * (100 + i),
      taxRate: 0.18,
      sacCode: "998313",
    })),
    { gst: { placeOfSupply: "29" } },
  ),
  paidWithLink: makeLineParams(gstLines, {
    status: "PAID",
    paymentLink: "https://rzp.io/i/paid123",
    payment: { paidOn: new Date("2026-04-30T00:00:00.000Z") },
    gst: { placeOfSupply: "29" },
  }),
  partialWithBalance: makeLineParams(gstLines, {
    status: "PARTIALLY_PAID",
    paymentLink: "https://rzp.io/i/partial456",
    payment: { amountPaid: 4000, paidOn: new Date("2026-04-30T00:00:00.000Z") },
    gst: { placeOfSupply: "29" },
  }),
  unpaidWithLink: makeLineParams(gstLines, { paymentLink: "https://rzp.io/i/unpaid789", gst: { placeOfSupply: "29" } }),
  accentInvoice: makeLineParams(gstLines, { accentColor: "#0B5FFF", gst: { placeOfSupply: "29" } }),
  accentClient: makeLineParams(gstLines, { client: { ...baseClient, invoiceAccentColor: "#B45309" }, gst: { placeOfSupply: "29" } }),
  sectionedProject: makeLineParams(projectLines, { billingMonth: "Customer portal, Q2 2026", gst: { placeOfSupply: "29" } }),
  tdsInvoice: makeLineParams(gstLines, { gst: { placeOfSupply: "29" }, tds: { section: "194J", ratePercent: 10, amount: 1600 } }),
  tdsInvoiceWithLink: makeLineParams(gstLines, { gst: { placeOfSupply: "29" }, tds: { section: "194J", ratePercent: 10, amount: 1600 }, paymentLink: "https://rzp.io/i/tds123" }),
  tdsPaid: makeLineParams(gstLines, { gst: { placeOfSupply: "29" }, status: "PAID", tds: { section: "194J", ratePercent: 10, amount: 1600 }, payment: { paidOn: new Date("2026-04-30T00:00:00.000Z") } }),
  tdsOnExport: makeParams({ client: { ...baseClient, country: "United States", isExport: true, taxId: null }, tds: { section: "194J", ratePercent: 10, amount: 1010 }, baseCurrency: "USD", userLocale: "en-US" }, 2, true),
};
