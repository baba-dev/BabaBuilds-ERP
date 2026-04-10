export type RecentInvoiceRow = {
  id: string;
  invoiceDate: string | Date;
  invoiceNumber: string;
  clientName: string;
  billingMonth?: string | null;
  status: string;
  totalAmount: number;
  amountReceived?: number | null;
  pdfPath: string;
  updatedAt?: string | Date | null;
};

export type IntegrationStatus = "healthy" | "partial" | "missing";

export type DashboardData = {
  kpis: {
    totalRevenue: number;
    totalWealth: number;
    estimatedTax: number;
    activeClients: number;
  };
  mrr: {
    total: number;
    retainers: Array<{
      clientName: string;
      serviceName: string;
      amount: number;
      health: "good" | "warning" | "danger" | "pending";
    }>;
  };
  charts: {
    revenue: Array<{ name: string; revenue: number }>;
    wealth: Array<{ name: string; value: number; color: string }>;
  };
  readiness?: {
    integrations: Record<"groq" | "payment" | "smtp", { configured: boolean; status: IntegrationStatus }>;
    summary: Record<IntegrationStatus, number>;
  };
  recentInvoices: RecentInvoiceRow[];
};
