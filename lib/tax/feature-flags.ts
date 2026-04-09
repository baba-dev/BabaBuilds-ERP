export const TAX_FEATURE_FLAG_KEYS = [
  'tax.override_ui.enabled',
  'tax.audit.enabled',
  'tax.provider.stripe.enabled',
] as const;

export type TaxFeatureFlagKey = (typeof TAX_FEATURE_FLAG_KEYS)[number];

export type TaxFeatureFlags = Record<TaxFeatureFlagKey, boolean>;

interface TaxFeatureFlagContext {
  workspaceId: string;
  workspaceName?: string | null;
}

const DEFAULT_ROLLOUT_PHASE = 1;

function parseCsvEnv(value: string | undefined): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function normalizeName(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function getRolloutPhase(): number {
  const raw = Number(process.env.TAX_OVERRIDE_ROLLOUT_PHASE ?? DEFAULT_ROLLOUT_PHASE);
  if (!Number.isFinite(raw)) return DEFAULT_ROLLOUT_PHASE;
  return Math.max(1, Math.floor(raw));
}

function isInternalWorkspace(context: TaxFeatureFlagContext): boolean {
  const internalWorkspaceIds = parseCsvEnv(process.env.TAX_OVERRIDE_INTERNAL_WORKSPACE_IDS);
  if (internalWorkspaceIds.has(context.workspaceId)) return true;

  const normalizedWorkspaceName = normalizeName(context.workspaceName);
  if (!normalizedWorkspaceName) return false;

  const internalWorkspaceNames = parseCsvEnv(process.env.TAX_OVERRIDE_INTERNAL_WORKSPACE_NAMES);
  if (internalWorkspaceNames.size === 0) {
    return normalizedWorkspaceName.includes('internal');
  }

  return internalWorkspaceNames.has(normalizedWorkspaceName);
}

export function getTaxFeatureFlags(context: TaxFeatureFlagContext): TaxFeatureFlags {
  const rolloutPhase = getRolloutPhase();
  const internal = isInternalWorkspace(context);

  const overrideWorkspaceIds = parseCsvEnv(process.env.TAX_OVERRIDE_OVERRIDE_UI_WORKSPACE_IDS);
  const providerWorkspaceIds = parseCsvEnv(process.env.TAX_OVERRIDE_PROVIDER_STRIPE_WORKSPACE_IDS);

  const overrideUiEnabled = rolloutPhase >= 1 && (internal || (rolloutPhase >= 4 && overrideWorkspaceIds.has(context.workspaceId)));
  const auditEnabled = rolloutPhase >= 3 && (internal || (rolloutPhase >= 4 && overrideWorkspaceIds.has(context.workspaceId)));
  const providerStripeEnabled = rolloutPhase >= 5 && (internal || providerWorkspaceIds.has(context.workspaceId));

  return {
    'tax.override_ui.enabled': overrideUiEnabled,
    'tax.audit.enabled': auditEnabled,
    'tax.provider.stripe.enabled': providerStripeEnabled,
  };
}
