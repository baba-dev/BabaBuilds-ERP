/**
 * Every in-app destination the dashboard links to. Kept in one place so a test
 * can prove each one is a real page: a dashboard that links to a missing page
 * sends people to a 404 from the first screen they see.
 */
export const DASHBOARD_ROUTES = {
  invoices: "/income",
  newInvoice: "/income/new",
  overdueInvoices: "/income?status=OVERDUE",
  collections: "/ar-collections",
  expenses: "/expenses",
  clients: "/clients",
  newClient: "/clients?new=1",
  proposals: "/proposals",
  newProposal: "/proposals/new",
  acceptedProposals: "/proposals?status=ACCEPTED",
  pipeline: "/proposals/pipeline",
  retainers: "/retainers",
  newRetainer: "/retainers/new",
  reconciliation: "/reconciliation",
  bankImport: "/reconciliation/import",
  cashFlow: "/cash-flow",
  reporting: "/reporting",
  tax: "/tax",
  inventory: "/inventory",
  purchaseOrders: "/inventory/purchase-orders",
  shop: "/shop",
  shopSettings: "/settings/shop",
  importManager: "/import-manager",
  importSettings: "/settings/imports",
  setup: "/setup",
  settings: "/settings",
  profile: "/settings/profile",
  billing: "/settings/billing",
} as const;

export type DashboardRouteKey = keyof typeof DASHBOARD_ROUTES;

export const invoiceRoute = (invoiceId: string) => `${DASHBOARD_ROUTES.invoices}?invoice=${encodeURIComponent(invoiceId)}`;
