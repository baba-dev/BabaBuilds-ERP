const WRITE_TOOLS = new Set<string>([
  "create_task",
  "mark_invoice_paid",
  "send_invoice_reminder",
  "create_client",
  "update_client_status",
  "log_expense",
  "auto_reconcile",
  "update_proposal_status",
  "convert_to_invoice",
  "add_service_to_catalog",
  "create_retainer",
  "update_retainer_status",
  "log_investment",
  "draft_proposal",
  "draft_invoice",
  "ui_navigate",
  "set_ui_theme",
  "set_shop_status",
  "update_shop_announcement",
  "open_shop_dashboard",
]);

const WRITE_ALLOWED_ROLES = new Set<string>([
  "OWNER",
  "ADMIN",
  "FINANCE_MANAGER",
  "ACCOUNTANT",
  "OPERATIONS_MANAGER",
  "SALES_MANAGER",
  "INVENTORY_MANAGER",
]);

const REPORTING_ALLOWED_ROLES = new Set<string>(['OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'VIEWER']);

export function isWriteTool(toolName: string) {
  return WRITE_TOOLS.has(toolName);
}

export function canExecuteToolForRole(toolName: string, role: string | null | undefined) {
  if (!isWriteTool(toolName)) return true;
  if (!role) return true;
  return WRITE_ALLOWED_ROLES.has(role);
}

const REPORTING_TOOLS = new Set(['list_reporting_presets', 'open_reporting_center']);

export function isReportingTool(toolName: string) {
  return REPORTING_TOOLS.has(toolName);
}

/** Chat reporting tools: require module + RBAC (session checked in route). */
export function reportingToolAllowed(
  toolName: string,
  moduleEnabled: boolean,
  canView: boolean,
  canRun: boolean,
): boolean {
  if (!moduleEnabled || !canView) return false;
  if (toolName === 'list_reporting_presets') return true;
  if (toolName === 'open_reporting_center') return canRun;
  return false;
}

