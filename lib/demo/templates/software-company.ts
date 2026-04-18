import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const softwareCompanyTemplate: DemoTemplateDefinition = {
  key: "software_company",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "US",
    baseCurrency: "USD",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
  },
  businessProfile: {
    companyName: "Northstar Software LLC",
    proprietorName: "Maya Thompson",
    address: "401 Mission Street, San Francisco, CA 94105",
    email: "billing@northstar.demo",
    phone: "+1 415 555 0189",
    website: "https://northstar.demo",
    panNumber: "US-TAX-44218",
    bankName: "Chase",
    accountName: "Northstar Software LLC",
    accountNumber: "987654321",
    ifscCode: "CHASUS33",
    taxLabel: "Sales Tax",
    taxIdLabel: "EIN",
    routingLabel: "ABA",
    defaultTaxRate: 8.25,
    defaultSacCode: "998314",
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    { ref: "atlas", name: "Atlas Freight", address: "Austin, TX", country: "USA", taxId: "US-EIN-112233", email: "ap@atlasfreight.com", isExport: false },
    { ref: "lumina", name: "Lumina Health", address: "Seattle, WA", country: "USA", taxId: "US-EIN-778899", email: "finance@luminahealth.com", isExport: false },
    { ref: "globalpay", name: "GlobalPay EU", address: "Dublin, IE", country: "Ireland", email: "payables@globalpay.eu", isExport: true },
  ],
  services: [
    { ref: "platform", name: "SaaS Platform Engineering", defaultPrice: 24000, description: "Product squad for roadmap delivery." },
    { ref: "ml", name: "ML Feature Sprint", defaultPrice: 18000, description: "Applied AI feature implementation and launch." },
    { ref: "sre", name: "SRE Reliability Retainer", defaultPrice: 12000, description: "24/7 uptime monitoring and incident readiness." },
  ],
  proposals: [
    { proposalNo: "EST-26-101", clientRef: "atlas", serviceRef: "platform", title: "Freight Ops Platform", status: "SENT", validDays: 14, quantity: 1 },
    { proposalNo: "EST-26-102", clientRef: "lumina", serviceRef: "ml", title: "Patient Triage AI", status: "VIEWED", validDays: 10, quantity: 1 },
  ],
  invoices: [
    { clientRef: "atlas", daysAgo: -60, amount: 24000, description: "Q1 Roadmap Delivery", status: "PAID" },
    { clientRef: "lumina", daysAgo: -22, amount: 18000, description: "ML Feature Sprint", status: "PAID" },
    { clientRef: "globalpay", daysAgo: -6, amount: 12000, description: "Reliability Retainer", status: "PENDING" },
  ],
  expenses: [
    { daysAgo: -40, category: "Cloud", vendor: "AWS", amount: 7200, description: "Production infrastructure" },
    { daysAgo: -15, category: "Tools", vendor: "Linear", amount: 960, description: "Engineering seat subscriptions" },
  ],
  investments: [
    { daysAgo: -130, category: "Treasury", assetName: "US T-Bills", amount: 20000 },
  ],
  retainers: [
    { clientRef: "globalpay", serviceName: "SRE Reliability", amount: 12000, frequency: "MONTHLY", nextBillingInDays: 12, status: "ACTIVE", autoAppendMonth: true, sacCode: "998314" },
  ],
  modules: {
    REVENUE_PIPELINE: true,
    CASH_FLOW: true,
    PAYROLL: true,
  },
};
