import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const taxAgencyTemplate: DemoTemplateDefinition = {
  key: "tax_agency",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "IN",
    baseCurrency: "INR",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
  },
  businessProfile: {
    companyName: "Ledgerline Tax Advisors",
    proprietorName: "Rohit Menon",
    address: "12th Floor, Peninsula Tower, Lower Parel, Mumbai",
    email: "returns@ledgerline.demo",
    phone: "+91 22 4000 1234",
    website: "https://ledgerline.demo",
    panNumber: "AAACL1234K",
    udyamNumber: "UDYAM-MH-01-9988776",
    gstin: "27AAACL1234K1Z3",
    bankName: "ICICI Bank",
    accountName: "Ledgerline Tax Advisors",
    accountNumber: "221100998877",
    ifscCode: "ICIC0000420",
    defaultTaxRate: 18,
    defaultSacCode: "998212",
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    { ref: "surya", name: "Surya Exports", address: "Ahmedabad, Gujarat", country: "India", taxId: "24SURYA1234F1Z7", email: "accounts@suryaexports.in", isExport: true },
    { ref: "verdant", name: "Verdant Foods Pvt Ltd", address: "Pune, Maharashtra", country: "India", taxId: "27VERDA4567L1Z2", email: "payables@verdantfoods.in", isExport: false },
    { ref: "ion", name: "Ion Mobility", address: "Bengaluru, Karnataka", country: "India", taxId: "29IONMB7788R1Z9", email: "finance@ionmobility.in", isExport: false },
  ],
  services: [
    { ref: "gst", name: "GST Filing & Reconciliation", defaultPrice: 25000, description: "Monthly GST filing and mismatch resolution." },
    { ref: "tds", name: "TDS Compliance Desk", defaultPrice: 18000, description: "Quarterly filing and challan workflows." },
    { ref: "audit", name: "Tax Litigation Support", defaultPrice: 40000, description: "Notices, hearings, and response management." },
  ],
  proposals: [
    { proposalNo: "EST-26-201", clientRef: "verdant", serviceRef: "gst", title: "FY26 GST Managed Services", status: "ACCEPTED", validDays: -2, quantity: 1 },
    { proposalNo: "EST-26-202", clientRef: "ion", serviceRef: "tds", title: "Quarterly TDS Outsourcing", status: "SENT", validDays: 10, quantity: 1 },
  ],
  invoices: [
    { clientRef: "verdant", daysAgo: -75, amount: 25000, description: "GST Filing Retainer", status: "PAID" },
    { clientRef: "ion", daysAgo: -28, amount: 18000, description: "TDS Compliance Cycle", status: "PENDING" },
    { clientRef: "surya", daysAgo: -11, amount: 40000, description: "Litigation Support", status: "PENDING" },
  ],
  expenses: [
    { daysAgo: -25, category: "Professional", vendor: "Counsel Partners", amount: 12000, description: "External legal review" },
    { daysAgo: -8, category: "Travel", vendor: "Uber Business", amount: 3200, description: "Client hearing visit" },
  ],
  investments: [
    { daysAgo: -150, category: "80C", assetName: "Tax Saver ELSS", amount: 120000 },
  ],
  retainers: [
    { clientRef: "verdant", serviceName: "GST Filing", amount: 25000, frequency: "MONTHLY", nextBillingInDays: 6, status: "ACTIVE", autoAppendMonth: true, sacCode: "998212" },
    { clientRef: "ion", serviceName: "TDS Desk", amount: 18000, frequency: "MONTHLY", nextBillingInDays: 14, status: "ACTIVE", autoAppendMonth: true, sacCode: "998212" },
  ],
  modules: {
    TAX_ADVANCED: true,
    DOCUMENTS: true,
    CASH_FLOW: true,
  },
};
