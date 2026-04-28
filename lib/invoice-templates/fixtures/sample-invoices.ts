import type { PDFParams } from "@/lib/invoice/build-invoice-view-model";
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
    totals: overrides.totals ?? totals,
  };
};

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
};
