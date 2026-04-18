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

export function isWriteTool(toolName: string) {
  return WRITE_TOOLS.has(toolName);
}

export function canExecuteToolForRole(toolName: string, role: string | null | undefined) {
  if (!isWriteTool(toolName)) return true;
  if (!role) return true;
  return WRITE_ALLOWED_ROLES.has(role);
}

