import { PERMISSIONS, type Role } from '@/lib/permissions';

export type PrivilegedWorkflowKey =
  | 'VENDOR_PAYMENT_RELEASE'
  | 'BANK_ACCOUNT_CHANGE'
  | 'CREDIT_MEMO_APPROVAL'
  | 'JOURNAL_BACKDATING'
  | 'REFUND_OVERRIDE'
  | 'TAX_CONFIG_EDIT';

export type PrivilegedStepKey = 'INITIATE' | 'REVIEW' | 'APPROVE' | 'EXECUTE' | 'POST_AUDIT';
export type EntitlementType = 'RBAC' | 'ABAC';

export type AccessRule = { type: EntitlementType; constraint: string };
export type WorkflowStepDefinition = { step: PrivilegedStepKey; allowedRoles: Role[]; rules: AccessRule[] };
export type PrivilegedWorkflowDefinition = {
  key: PrivilegedWorkflowKey;
  title: string;
  riskTier: 'HIGH';
  mandatoryAuditTrail: true;
  steps: WorkflowStepDefinition[];
};

const makerStep = (step: 'INITIATE' | 'EXECUTE'): WorkflowStepDefinition => ({
  step,
  allowedRoles: ['OWNER', 'ADMIN'],
  rules: [
    { type: 'RBAC', constraint: 'Role must be OWNER or ADMIN.' },
    { type: 'ABAC', constraint: 'Workspace membership active and request reason provided.' },
  ],
});

const checkerStep = (step: 'REVIEW' | 'APPROVE'): WorkflowStepDefinition => ({
  step,
  allowedRoles: ['OWNER', 'ADMIN'],
  rules: [
    { type: 'RBAC', constraint: 'Role must be OWNER or ADMIN.' },
    { type: 'ABAC', constraint: 'Checker cannot be the same user as maker.' },
  ],
});

const auditStep = (): WorkflowStepDefinition => ({
  step: 'POST_AUDIT',
  allowedRoles: ['OWNER', 'ADMIN', 'VIEWER'],
  rules: [
    { type: 'RBAC', constraint: 'Audit reviewer must have log-read access.' },
    { type: 'ABAC', constraint: 'Immutable activity log entry with timestamp, actor, and change set required.' },
  ],
});

export const PRIVILEGED_WORKFLOWS: PrivilegedWorkflowDefinition[] = [
  { key: 'VENDOR_PAYMENT_RELEASE', title: 'Vendor payment release', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('REVIEW'), checkerStep('APPROVE'), makerStep('EXECUTE'), auditStep()] },
  { key: 'BANK_ACCOUNT_CHANGE', title: 'Bank account changes', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('REVIEW'), checkerStep('APPROVE'), auditStep()] },
  { key: 'CREDIT_MEMO_APPROVAL', title: 'Credit memo approvals', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('APPROVE'), auditStep()] },
  { key: 'JOURNAL_BACKDATING', title: 'Journal backdating', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('REVIEW'), checkerStep('APPROVE'), auditStep()] },
  { key: 'REFUND_OVERRIDE', title: 'Refund overrides', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('APPROVE'), makerStep('EXECUTE'), auditStep()] },
  { key: 'TAX_CONFIG_EDIT', title: 'Tax config edits', riskTier: 'HIGH', mandatoryAuditTrail: true, steps: [makerStep('INITIATE'), checkerStep('REVIEW'), checkerStep('APPROVE'), auditStep()] },
];

export const RBAC_PERMISSION_MAP = Object.entries(PERMISSIONS).map(([permission, roles]) => ({
  permission: permission as keyof typeof PERMISSIONS,
  roles: roles as Role[],
}));

export const ABAC_CONSTRAINTS = [
  { key: 'active_workspace_membership', appliesTo: PRIVILEGED_WORKFLOWS.map((w) => w.key), description: 'Actor must be active in the target workspace.' },
  { key: 'change_reason_required', appliesTo: PRIVILEGED_WORKFLOWS.map((w) => w.key), description: 'A business justification must be present and non-empty.' },
  { key: 'maker_checker_separation', appliesTo: PRIVILEGED_WORKFLOWS.map((w) => w.key), description: 'Initiator and approver must be distinct user identities.' },
  { key: 'break_glass_timebox', appliesTo: PRIVILEGED_WORKFLOWS.map((w) => w.key), description: 'Emergency entitlements must have explicit expiry timestamps.' },
] as const;

export const SOD_CONFLICT_RULES = [
  { id: 'SOD-001', description: 'Member can both edit and delete invoices, enabling unilateral credit memo style reversals.', incompatiblePermissions: ['EDIT_INVOICE', 'DELETE_INVOICE'], impactedWorkflows: ['CREDIT_MEMO_APPROVAL', 'REFUND_OVERRIDE'], severity: 'HIGH' },
  { id: 'SOD-002', description: 'Billing management combined with workspace settings can alter payment rails and release funds.', incompatiblePermissions: ['MANAGE_BILLING', 'MANAGE_WORKSPACE_SETTINGS'], impactedWorkflows: ['VENDOR_PAYMENT_RELEASE', 'BANK_ACCOUNT_CHANGE'], severity: 'HIGH' },
  { id: 'SOD-003', description: 'Expense creation and deletion in one role can conceal backdated journal adjustments.', incompatiblePermissions: ['CREATE_EXPENSE', 'DELETE_EXPENSE'], impactedWorkflows: ['JOURNAL_BACKDATING'], severity: 'HIGH' },
  { id: 'SOD-004', description: 'Client and invoice control together can force refund overrides without independent review.', incompatiblePermissions: ['MANAGE_CLIENTS', 'DELETE_INVOICE'], impactedWorkflows: ['REFUND_OVERRIDE'], severity: 'HIGH' },
] as const;

export function detectSoDConflictsByRole() {
  const roles: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
  return roles.flatMap((role) =>
    SOD_CONFLICT_RULES.flatMap((rule) => {
      const perms = rule.incompatiblePermissions as Array<keyof typeof PERMISSIONS>;
      const hasAll = perms.every((permission) => PERMISSIONS[permission].includes(role));
      if (!hasAll) return [];
      return [{ role, ruleId: rule.id, description: rule.description, violatedPermissions: perms, impactedWorkflows: rule.impactedWorkflows, severity: rule.severity }];
    })
  );
}

export type ApprovalGateRecord = { workflow: PrivilegedWorkflowKey; operationKey: string; makerUserId: string; checkerUserId?: string; checkerRole?: Role; requestedAt: string; decidedAt?: string; decision: 'PENDING' | 'APPROVED' | 'REJECTED'; reason: string; auditTrailId: string };

export function applyMakerCheckerDecision(gate: ApprovalGateRecord, input: { checkerUserId: string; checkerRole: Role; decision: 'APPROVED' | 'REJECTED'; decidedAt?: Date }) {
  if (gate.decision !== 'PENDING') throw new Error('Approval gate is already decided.');
  if (!['OWNER', 'ADMIN'].includes(input.checkerRole)) throw new Error('Checker role is not authorized for privileged approvals.');
  if (input.checkerUserId === gate.makerUserId) throw new Error('Maker-checker violation: maker and checker must be different users.');
  return { ...gate, checkerUserId: input.checkerUserId, checkerRole: input.checkerRole, decision: input.decision, decidedAt: (input.decidedAt ?? new Date()).toISOString() };
}

const QUARTERLY_REVIEW_DAYS = 92;

export function validateBreakGlassAccounts(accounts: Array<{ label: string; expiresAt?: string | null; lastReviewAt?: string | null; auditTrailId?: string | null }>, now = new Date()) {
  return accounts.map((account) => {
    const findings: string[] = [];
    if (!account.expiresAt) findings.push('Missing expiration (time limit) for emergency access.');
    else {
      const expiry = new Date(account.expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry <= now) findings.push('Emergency access is expired or has an invalid expiry timestamp.');
    }
    if (!account.auditTrailId) findings.push('Missing audit trail reference for break-glass activation.');
    if (!account.lastReviewAt) findings.push('Missing periodic review record for emergency account.');
    else {
      const reviewDate = new Date(account.lastReviewAt);
      const ageDays = (now.getTime() - reviewDate.getTime()) / (1000 * 60 * 60 * 24);
      if (Number.isNaN(reviewDate.getTime()) || ageDays > QUARTERLY_REVIEW_DAYS) findings.push('Emergency account review is stale (older than one quarter).');
    }
    return { account: account.label, isValid: findings.length === 0, findings };
  });
}

export function buildQuarterlySoDCertificationTasks(input: { managerUserId: string; dueDate?: Date }) {
  const dueDate = (input.dueDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)).toISOString();
  const conflictsByRole = detectSoDConflictsByRole().reduce<Record<Role, ReturnType<typeof detectSoDConflictsByRole>>>(
    (acc, conflict) => {
      acc[conflict.role].push(conflict);
      return acc;
    },
    { OWNER: [], ADMIN: [], MEMBER: [], VIEWER: [] }
  );
  return (Object.keys(conflictsByRole) as Role[]).map((role) => ({
    role,
    managerUserId: input.managerUserId,
    dueDate,
    conflicts: conflictsByRole[role],
    status: conflictsByRole[role].length ? 'EXCEPTION_REMEDIATION_REQUIRED' : 'PENDING_SIGN_OFF',
  }));
}

export function buildPrivilegedAccessControlReport(managerUserId: string) {
  return {
    generatedAt: new Date().toISOString(),
    privilegedWorkflows: PRIVILEGED_WORKFLOWS,
    rbacPermissionMap: RBAC_PERMISSION_MAP,
    abacConstraints: ABAC_CONSTRAINTS,
    sodConflicts: detectSoDConflictsByRole(),
    quarterlyCertification: buildQuarterlySoDCertificationTasks({ managerUserId }),
  };
}
