/**
 * Ordered routes for sales brochure screenshots (Playwright capture).
 * Paths deduped; dynamic paths resolved at capture time via API.
 */

export type BrochureRouteEntry = {
  /** Stable filename stem (no extension) */
  id: string;
  /** App path (no query) */
  path: string;
  /** Human title for manifest + HTML alt text */
  title: string;
  /** Brochure section key */
  section: BrochureSection;
};

export type BrochureSection =
  | "marketing"
  | "overview"
  | "operations"
  | "sales"
  | "finance"
  | "compliance"
  | "workspace"
  | "public_shop";

/** Routes captured after demo login (authenticated app). */
export const brochureAuthenticatedRoutes: BrochureRouteEntry[] = [
  { id: "dashboard", path: "/dashboard", title: "Dashboard", section: "overview" },
  { id: "services", path: "/services", title: "Service catalog", section: "operations" },
  { id: "inventory", path: "/inventory", title: "Inventory", section: "operations" },
  { id: "inventory_po", path: "/inventory/purchase-orders", title: "Purchase orders", section: "operations" },
  { id: "clients", path: "/clients", title: "Clients", section: "operations" },
  { id: "documents", path: "/documents", title: "Document vault", section: "operations" },
  { id: "documents_inbox", path: "/documents/inbox", title: "Document inbox", section: "operations" },
  { id: "documents_vault", path: "/documents/vault", title: "Document archive", section: "operations" },
  { id: "documents_compliance", path: "/documents/compliance", title: "Compliance documents", section: "operations" },
  { id: "import_manager", path: "/import-manager", title: "Import manager", section: "operations" },
  { id: "inbox_import", path: "/inbox/import", title: "Inbox import", section: "operations" },
  { id: "proposals", path: "/proposals", title: "Proposals", section: "sales" },
  { id: "proposals_pipeline", path: "/proposals/pipeline", title: "Revenue pipeline", section: "sales" },
  { id: "retainers", path: "/retainers", title: "Retainers", section: "sales" },
  { id: "income", path: "/income", title: "Income & invoices", section: "sales" },
  { id: "invoice", path: "/invoice", title: "Invoice workspace", section: "sales" },
  { id: "expenses", path: "/expenses", title: "Expenses", section: "finance" },
  { id: "cash_flow_overview", path: "/cash-flow/overview", title: "Cash flow overview", section: "finance" },
  { id: "cash_flow_scenarios", path: "/cash-flow/scenarios", title: "Cash scenarios", section: "finance" },
  { id: "cash_flow_alerts", path: "/cash-flow/alerts", title: "Liquidity alerts", section: "finance" },
  { id: "reporting", path: "/reporting", title: "Reporting center", section: "finance" },
  { id: "reporting_ar_aging", path: "/reporting/ar_aging", title: "AR aging preset", section: "finance" },
  { id: "ar_collections", path: "/ar-collections", title: "AR collections", section: "finance" },
  { id: "tax", path: "/tax", title: "Tax hub", section: "finance" },
  { id: "tax_advanced", path: "/tax/advanced", title: "Tax advanced", section: "finance" },
  { id: "reconciliation", path: "/reconciliation", title: "AI reconciliation", section: "finance" },
  { id: "reconciliation_settings", path: "/reconciliation/settings", title: "Reconciliation settings", section: "finance" },
  { id: "ca_portal", path: "/ca-portal", title: "CA portal", section: "compliance" },
  { id: "workforce", path: "/workforce", title: "Workforce", section: "workspace" },
  { id: "workforce_people", path: "/workforce/people", title: "People directory", section: "workspace" },
  { id: "workforce_attendance", path: "/workforce/attendance", title: "Attendance", section: "workspace" },
  { id: "workforce_leave", path: "/workforce/leave", title: "Leave", section: "workspace" },
  { id: "payroll", path: "/payroll", title: "Payroll", section: "workspace" },
  { id: "payroll_settings", path: "/payroll/settings", title: "Payroll settings", section: "workspace" },
  { id: "shop_admin", path: "/shop", title: "Shop (admin)", section: "operations" },
  { id: "settings", path: "/settings", title: "Settings", section: "overview" },
  { id: "settings_team", path: "/settings/team", title: "Team & seats", section: "overview" },
  { id: "settings_billing", path: "/settings/billing", title: "Billing", section: "overview" },
  { id: "settings_shop", path: "/settings/shop", title: "Shop settings", section: "operations" },
  { id: "partner", path: "/partner", title: "Partner hub", section: "overview" },
  { id: "referrals", path: "/referrals", title: "Referrals", section: "overview" },
  { id: "help_in_app", path: "/dashboard/help", title: "In-app help", section: "overview" },
];

/** Public routes (no session). Capture in a separate browser context. */
export const brochurePublicRoutes: BrochureRouteEntry[] = [
  { id: "landing", path: "/", title: "Marketing home", section: "marketing" },
  { id: "login", path: "/login", title: "Sign in", section: "marketing" },
  { id: "help_hub", path: "/help-hub", title: "Help hub", section: "marketing" },
  { id: "for_small_business", path: "/for-small-businesses", title: "For small businesses", section: "marketing" },
];
