import { z } from 'zod';
import {
  type BusinessRole,
  type Permission,
  hasPermission,
  isValidBusinessRole,
} from '@/lib/permissions';

export const TOOL_NAMES = [
  'lookup_invoice_details',
  'get_client_summary',
  'get_tax_summary',
  'get_service_catalog',
  'get_proposals',
  'create_task',
  'ui_navigate',
  'set_ui_theme',
  'get_overdue_invoices',
  'mark_invoice_paid',
  'send_invoice_reminder',
  'draft_invoice',
  'create_client',
  'update_client_status',
  'search_clients',
  'get_client_ledger',
  'log_expense',
  'get_expenses_summary',
  'get_unreconciled_transactions',
  'auto_reconcile',
  'draft_proposal',
  'update_proposal_status',
  'convert_to_invoice',
  'add_service_to_catalog',
  'create_retainer',
  'update_retainer_status',
  'get_active_retainers',
  'log_investment',
  'get_investments_list',
  'calculate_estimated_tax',
  'predict_stockouts',
  'list_reporting_presets',
  'open_reporting_center',
  'get_shop_summary',
  'get_top_shop_products',
  'set_shop_status',
  'update_shop_announcement',
  'open_shop_dashboard',
  'get_email_billing_summary',
  'list_email_billing_review_items',
  'list_unmapped_email_domains',
  'open_email_billing_dashboard',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const TOOL_NAME_SET = new Set<string>(TOOL_NAMES);

/**
 * How the chat route executes each tool. Declared as an exhaustive Record so a
 * newly advertised tool cannot compile until it is classified.
 *  - read:     side-effect-free lookup served by a handler in the chat route
 *  - mutation: changes data; only runs behind a fresh signed user confirmation
 *  - inline:   UI action or draft the chat route builds itself (navigate, theme, drafts)
 */
export type ToolExecutionKind = 'read' | 'mutation' | 'inline';

export const TOOL_EXECUTION_KIND = {
  lookup_invoice_details: 'read',
  get_client_summary: 'read',
  get_tax_summary: 'read',
  get_service_catalog: 'read',
  get_proposals: 'read',
  get_overdue_invoices: 'read',
  search_clients: 'read',
  get_client_ledger: 'read',
  get_expenses_summary: 'read',
  get_unreconciled_transactions: 'read',
  get_active_retainers: 'read',
  get_investments_list: 'read',
  calculate_estimated_tax: 'read',
  predict_stockouts: 'read',
  get_shop_summary: 'read',
  get_top_shop_products: 'read',
  get_email_billing_summary: 'read',
  list_email_billing_review_items: 'read',
  list_unmapped_email_domains: 'read',
  create_task: 'mutation',
  mark_invoice_paid: 'mutation',
  send_invoice_reminder: 'mutation',
  create_client: 'mutation',
  update_client_status: 'mutation',
  log_expense: 'mutation',
  auto_reconcile: 'mutation',
  update_proposal_status: 'mutation',
  convert_to_invoice: 'mutation',
  add_service_to_catalog: 'mutation',
  create_retainer: 'mutation',
  update_retainer_status: 'mutation',
  log_investment: 'mutation',
  set_shop_status: 'mutation',
  update_shop_announcement: 'mutation',
  ui_navigate: 'inline',
  set_ui_theme: 'inline',
  draft_invoice: 'inline',
  draft_proposal: 'inline',
  list_reporting_presets: 'inline',
  open_reporting_center: 'inline',
  open_shop_dashboard: 'inline',
  open_email_billing_dashboard: 'inline',
} as const satisfies Record<ToolName, ToolExecutionKind>;

export type ReadToolName = {
  [K in ToolName]: (typeof TOOL_EXECUTION_KIND)[K] extends 'read' ? K : never;
}[ToolName];

const MUTATING_TOOLS: ReadonlySet<ToolName> = new Set(
  TOOL_NAMES.filter((name) => TOOL_EXECUTION_KIND[name] === 'mutation'),
);

const emptyArgsSchema = z.object({}).strict();
const shortText = z.string().trim().min(1).max(256);
const optionalLongText = z.string().trim().max(2_000).optional();
const money = z.number().finite().positive().max(1_000_000_000_000);
const isoDate = z.string().trim().max(64).refine(
  (value) => Number.isFinite(Date.parse(value)),
  'A valid ISO date is required',
);

export const ALLOWED_NAVIGATION_PATHS = [
  '/',
  '/dashboard',
  '/income',
  '/invoice',
  '/clients',
  '/settings',
  '/tax',
  '/services',
  '/proposals',
  '/retainers',
  '/email-billing',
  '/email-billing/domains',
  '/email-billing/review',
  '/email-billing/plans',
  '/email-billing/servers',
  '/email-billing/settings',
] as const;

const navigatePayloadSchema = z.object({
  client: shortText.optional(),
  clientName: shortText.optional(),
  amount: money.optional(),
  description: optionalLongText,
}).strict();

const navigateArgsSchema = z.object({
  path: z.enum(ALLOWED_NAVIGATION_PATHS),
  payload: navigatePayloadSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.payload && value.path !== '/income' && value.path !== '/invoice') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['payload'],
      message: 'Navigation payloads are only accepted for the invoice form',
    });
  }
});

const reportingFiltersSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: shortText.optional(),
  clientId: shortText.optional(),
  supplierId: shortText.optional(),
  brand: shortText.optional(),
  category: shortText.optional(),
  country: shortText.optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
}).strict();

const TOOL_ARGUMENT_SCHEMAS = {
  lookup_invoice_details: z.object({ invoice_number: shortText }).strict(),
  get_client_summary: z.object({ client_name: shortText }).strict(),
  get_tax_summary: emptyArgsSchema,
  get_service_catalog: emptyArgsSchema,
  get_proposals: z.object({
    status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'INVOICED']).optional(),
  }).strict(),
  create_task: z.object({
    title: shortText,
    description: optionalLongText,
    dueDate: isoDate.optional(),
  }).strict(),
  ui_navigate: navigateArgsSchema,
  set_ui_theme: z.object({ theme: z.enum(['light', 'dark', 'system']) }).strict(),
  get_overdue_invoices: emptyArgsSchema,
  mark_invoice_paid: z.object({ invoice_number: shortText }).strict(),
  send_invoice_reminder: z.object({ invoice_number: shortText }).strict(),
  draft_invoice: z.object({
    client_name: shortText,
    amount: money,
    description: optionalLongText,
  }).strict(),
  create_client: z.object({
    name: shortText,
    email: z.string().trim().email().max(320).optional(),
    taxId: z.string().trim().min(1).max(128).optional(),
    address: z.string().trim().max(1_000).optional(),
    country: z.string().trim().max(128).optional(),
  }).strict(),
  update_client_status: z.object({
    client_name: shortText,
    status: z.enum(['ACTIVE', 'INACTIVE', 'VIP']),
  }).strict(),
  search_clients: z.object({ query: shortText }).strict(),
  get_client_ledger: z.object({ client_name: shortText }).strict(),
  log_expense: z.object({
    vendor: shortText,
    amount: money,
    category: shortText,
    description: optionalLongText,
    dateString: isoDate.optional(),
  }).strict(),
  get_expenses_summary: emptyArgsSchema,
  get_unreconciled_transactions: emptyArgsSchema,
  auto_reconcile: z.object({
    transactionId: shortText,
    invoiceNumber: shortText,
  }).strict(),
  draft_proposal: z.object({
    client_name: shortText,
    title: shortText,
    total_amount: money,
  }).strict(),
  update_proposal_status: z.object({
    proposal_no: shortText,
    status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'DECLINED']),
  }).strict(),
  convert_to_invoice: z.object({ proposal_no: shortText }).strict(),
  add_service_to_catalog: z.object({
    name: shortText,
    default_price: money,
    description: optionalLongText,
  }).strict(),
  create_retainer: z.object({
    client_name: shortText,
    service_name: shortText,
    amount: money,
    frequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUALLY']),
    start_date: isoDate.optional(),
  }).strict(),
  update_retainer_status: z.object({
    service_name: shortText,
    client_name: shortText,
    status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']),
  }).strict(),
  get_active_retainers: emptyArgsSchema,
  log_investment: z.object({
    asset_name: shortText,
    amount: money,
    category: shortText,
    date_string: isoDate.optional(),
  }).strict(),
  get_investments_list: emptyArgsSchema,
  calculate_estimated_tax: emptyArgsSchema,
  predict_stockouts: emptyArgsSchema,
  list_reporting_presets: emptyArgsSchema,
  open_reporting_center: z.object({
    presetId: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,127}$/),
    filters: reportingFiltersSchema.optional(),
  }).strict(),
  get_shop_summary: emptyArgsSchema,
  get_top_shop_products: emptyArgsSchema,
  set_shop_status: z.object({ enabled: z.boolean() }).strict(),
  update_shop_announcement: z.object({
    announcement: z.string().trim().max(240),
  }).strict(),
  open_shop_dashboard: emptyArgsSchema,
  get_email_billing_summary: emptyArgsSchema,
  list_email_billing_review_items: emptyArgsSchema,
  list_unmapped_email_domains: emptyArgsSchema,
  open_email_billing_dashboard: emptyArgsSchema,
} satisfies Record<ToolName, z.ZodTypeAny>;

const TOOL_PERMISSION_MAP: Record<ToolName, readonly Permission[]> = {
  lookup_invoice_details: ['invoices.view'],
  get_client_summary: ['clients.view', 'invoices.view'],
  get_tax_summary: ['tax.view'],
  get_service_catalog: ['proposals.view'],
  get_proposals: ['proposals.view'],
  create_task: ['dashboard.view'],
  ui_navigate: ['dashboard.view'],
  set_ui_theme: ['dashboard.view'],
  get_overdue_invoices: ['invoices.view'],
  mark_invoice_paid: ['invoices.edit'],
  send_invoice_reminder: ['invoices.send'],
  draft_invoice: ['invoices.create'],
  create_client: ['clients.manage'],
  update_client_status: ['clients.manage'],
  search_clients: ['clients.view'],
  get_client_ledger: ['clients.view', 'invoices.view', 'proposals.view', 'retainers.view'],
  log_expense: ['expenses.create'],
  get_expenses_summary: ['expenses.view'],
  get_unreconciled_transactions: ['accounting.view'],
  auto_reconcile: ['accounting.post'],
  draft_proposal: ['proposals.create'],
  update_proposal_status: ['proposals.edit'],
  convert_to_invoice: ['proposals.convert', 'invoices.create'],
  add_service_to_catalog: ['proposals.edit'],
  create_retainer: ['retainers.manage'],
  update_retainer_status: ['retainers.manage'],
  get_active_retainers: ['retainers.view'],
  log_investment: ['tax.edit'],
  get_investments_list: ['tax.view'],
  calculate_estimated_tax: ['tax.view', 'expenses.view', 'invoices.view'],
  predict_stockouts: ['inventory.view'],
  list_reporting_presets: ['reporting_center.view'],
  open_reporting_center: ['reporting_center.view', 'reporting_center.query.run'],
  get_shop_summary: ['shop.view', 'shop.orders.view'],
  get_top_shop_products: ['shop.view', 'shop.orders.view'],
  set_shop_status: ['shop.view', 'shop.settings.manage'],
  update_shop_announcement: ['shop.view', 'shop.content.manage'],
  open_shop_dashboard: ['shop.view', 'shop.content.manage'],
  get_email_billing_summary: ['invoices.view'],
  list_email_billing_review_items: ['invoices.view'],
  list_unmapped_email_domains: ['invoices.view'],
  open_email_billing_dashboard: ['invoices.view'],
};

const NAVIGATION_PERMISSION_MAP: Record<(typeof ALLOWED_NAVIGATION_PATHS)[number], readonly Permission[]> = {
  '/': ['dashboard.view'],
  '/dashboard': ['dashboard.view'],
  '/income': ['invoices.view'],
  '/invoice': ['invoices.view'],
  '/clients': ['clients.view'],
  '/settings': ['workspace.manage_settings'],
  '/tax': ['tax.view'],
  '/services': ['proposals.view'],
  '/proposals': ['proposals.view'],
  '/retainers': ['retainers.view'],
  '/email-billing': ['invoices.view'],
  '/email-billing/domains': ['invoices.view'],
  '/email-billing/review': ['invoices.view'],
  '/email-billing/plans': ['invoices.view'],
  '/email-billing/servers': ['invoices.view'],
  '/email-billing/settings': ['invoices.view'],
};

const REPORTING_TOOLS = new Set<ToolName>([
  'list_reporting_presets',
  'open_reporting_center',
]);

export class ToolPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPolicyError';
  }
}

export function isKnownTool(toolName: string): toolName is ToolName {
  return TOOL_NAME_SET.has(toolName);
}

export function parseToolArguments(toolName: string, args: unknown): Record<string, unknown> {
  if (!isKnownTool(toolName)) {
    throw new ToolPolicyError('Unknown AI tool');
  }

  const parsed = TOOL_ARGUMENT_SCHEMAS[toolName].safeParse(args);
  if (!parsed.success) {
    throw new ToolPolicyError(`Invalid arguments for AI tool ${toolName}`);
  }
  return parsed.data as Record<string, unknown>;
}

export function getToolPermissionRequirements(
  toolName: string,
  args: unknown,
): readonly Permission[] {
  if (!isKnownTool(toolName)) {
    throw new ToolPolicyError('Unknown AI tool');
  }
  const parsedArgs = parseToolArguments(toolName, args);
  if (toolName === 'ui_navigate') {
    const path = parsedArgs.path as (typeof ALLOWED_NAVIGATION_PATHS)[number];
    return NAVIGATION_PERMISSION_MAP[path];
  }
  return TOOL_PERMISSION_MAP[toolName];
}

export function isMutatingTool(toolName: string): toolName is ToolName {
  return isKnownTool(toolName) && MUTATING_TOOLS.has(toolName);
}

export function isReadTool(toolName: string): toolName is ReadToolName {
  return isKnownTool(toolName) && TOOL_EXECUTION_KIND[toolName] === 'read';
}

/** Backwards-compatible name retained for callers and regression tests. */
export function isWriteTool(toolName: string): boolean {
  return isMutatingTool(toolName);
}

/**
 * Template-only UI hint. Server enforcement must use requirePermission() with
 * getToolPermissionRequirements() immediately before executing the tool.
 */
export function canExecuteToolForRole(
  toolName: string,
  role: string | null | undefined,
  args: unknown = {},
): boolean {
  if (!role || !isValidBusinessRole(role)) return false;
  try {
    return getToolPermissionRequirements(toolName, args).every((permission) =>
      hasPermission(role as BusinessRole, permission),
    );
  } catch {
    return false;
  }
}

export function isReportingTool(toolName: string): boolean {
  return isKnownTool(toolName) && REPORTING_TOOLS.has(toolName);
}

/** Chat reporting discovery gate. Execution is still enforced by requirePermission(). */
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

function textArg(args: Record<string, unknown>, key: string): string {
  return typeof args[key] === 'string' ? String(args[key]) : '';
}

export function summarizeToolMutation(toolName: string, rawArgs: unknown): string {
  const args = parseToolArguments(toolName, rawArgs);
  switch (toolName) {
    case 'create_task':
      return `Create task “${textArg(args, 'title')}”`;
    case 'mark_invoice_paid':
      return `Mark invoice ${textArg(args, 'invoice_number')} as fully paid`;
    case 'send_invoice_reminder':
      return `Send a payment reminder for invoice ${textArg(args, 'invoice_number')}`;
    case 'create_client':
      return `Create client “${textArg(args, 'name')}”`;
    case 'update_client_status':
      return `Set client “${textArg(args, 'client_name')}” to ${textArg(args, 'status')}`;
    case 'log_expense':
      return `Record an expense of ₹${String(args.amount)} for ${textArg(args, 'vendor')}`;
    case 'auto_reconcile':
      return `Reconcile bank transaction ${textArg(args, 'transactionId')} to invoice ${textArg(args, 'invoiceNumber')}`;
    case 'update_proposal_status':
      return `Set proposal ${textArg(args, 'proposal_no')} to ${textArg(args, 'status')}`;
    case 'convert_to_invoice':
      return `Convert proposal ${textArg(args, 'proposal_no')} into an invoice`;
    case 'add_service_to_catalog':
      return `Add service “${textArg(args, 'name')}” at ₹${String(args.default_price)}`;
    case 'create_retainer':
      return `Create a ${textArg(args, 'frequency')} retainer for ${textArg(args, 'client_name')} at ₹${String(args.amount)}`;
    case 'update_retainer_status':
      return `Set the ${textArg(args, 'service_name')} retainer for ${textArg(args, 'client_name')} to ${textArg(args, 'status')}`;
    case 'log_investment':
      return `Record a tax investment of ₹${String(args.amount)} in ${textArg(args, 'asset_name')}`;
    case 'set_shop_status':
      return args.enabled ? 'Enable the public shop' : 'Disable the public shop';
    case 'update_shop_announcement':
      return textArg(args, 'announcement')
        ? 'Update the public shop announcement'
        : 'Clear the public shop announcement';
    default:
      throw new ToolPolicyError('Tool is not an allowlisted mutation');
  }
}
