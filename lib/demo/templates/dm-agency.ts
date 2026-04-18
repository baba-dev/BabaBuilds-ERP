import type { DemoTemplateDefinition } from "@/lib/demo/templates/types";

export const dmAgencyTemplate: DemoTemplateDefinition = {
  key: "dm_agency",
  workspace: {
    name: "BabaBuilds Demo Enterprise",
    countryCode: "IN",
    baseCurrency: "INR",
    planTier: "PRO",
    subscriptionStatus: "ACTIVE",
  },
  businessProfile: {
    companyName: "Nexus Digital Agency",
    proprietorName: "Aditya Sharma",
    address: "Level 4, Tech Park, Koramangala, Bangalore, KA 560034",
    email: "billing@nexusdigital.demo",
    phone: "+91 98765 43210",
    website: "https://nexusdigital.demo",
    panNumber: "ABCDE1234F",
    udyamNumber: "UDYAM-KR-00-1234567",
    gstin: "29ABCDE1234F1Z5",
    bankName: "HDFC Bank Ltd.",
    accountName: "Nexus Digital Agency",
    accountNumber: "50200012345678",
    ifscCode: "HDFC0001234",
    defaultTaxRate: 18,
    defaultSacCode: "998313",
    groqApiKeyPlaintext: "gsk_demo_bypass_key_placeholder",
  },
  clients: [
    { ref: "stark", name: "Stark Industries", address: "Malibu Point 10880, CA", country: "USA", taxId: "US-EIN-987654", email: "accounts@stark.com", isExport: true },
    { ref: "reliance", name: "Reliance Retail", address: "Navi Mumbai, MH", country: "India", taxId: "27RELIANCE1234Z", email: "vendor.payments@ril.com", isExport: false },
    { ref: "zomato", name: "Zomato Ltd", address: "Gurugram, HR", country: "India", taxId: "06ZOMATO8888P1Z1", email: "tech.billing@zomato.com", isExport: false },
  ],
  services: [
    { ref: "web", name: "Full-Stack Web App Development", defaultPrice: 150000, description: "End-to-end custom Next.js and Node.js development." },
    { ref: "seo", name: "SEO Audit & Strategy", defaultPrice: 25000, description: "Technical SEO and growth roadmap." },
    { ref: "retainer", name: "Monthly Maintenance Retainer", defaultPrice: 15000, description: "Priority bug fixes and monitoring." },
  ],
  proposals: [
    { proposalNo: "EST-26-001", clientRef: "zomato", serviceRef: "web", title: "Fleet Dashboard Revamp", status: "ACCEPTED", validDays: -5, quantity: 1 },
    { proposalNo: "EST-26-002", clientRef: "reliance", serviceRef: "seo", title: "SEO Growth Package", status: "SENT", validDays: 7, quantity: 1 },
  ],
  invoices: [
    { clientRef: "stark", daysAgo: -90, amount: 45000, description: "Cloud Retainer", status: "PAID" },
    { clientRef: "reliance", daysAgo: -30, amount: 35000, description: "Security Retainer", status: "PENDING" },
    { clientRef: "zomato", daysAgo: -3, amount: 15000, description: "Maintenance Retainer", status: "PENDING" },
  ],
  expenses: [
    { daysAgo: -18, category: "Ads", vendor: "Meta Ads", amount: 28000, description: "Performance campaign spend" },
    { daysAgo: -5, category: "Meals", vendor: "Swiggy", amount: 850, description: "Client lunch" },
  ],
  investments: [
    { daysAgo: -200, category: "80C", assetName: "PPF Account", amount: 150000 },
    { daysAgo: -60, category: "Mutual Funds", assetName: "Index Fund", amount: 75000 },
  ],
  retainers: [
    { clientRef: "stark", serviceName: "Cloud Infrastructure", amount: 45000, frequency: "MONTHLY", nextBillingInDays: 18, status: "ACTIVE", autoAppendMonth: true, sacCode: "998313" },
    { clientRef: "reliance", serviceName: "Security Monitoring", amount: 35000, frequency: "MONTHLY", nextBillingInDays: 8, status: "ACTIVE", autoAppendMonth: true, sacCode: "998313" },
  ],
  modules: {
    REVENUE_PIPELINE: true,
    CASH_FLOW: true,
    DOCUMENTS: true,
  },
};
