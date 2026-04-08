export const TAX_HELP_COPY = {
  estimate_basis_explainer:
    "Basis version shows the exact rule set used for this estimate so you can verify which country and effective-date policy was applied.",
  manual_override_warning:
    "Manual override bypasses automatic rule resolution and can impact compliance. Review changes with your CA or tax advisor before finalizing.",
  effective_dates_hint:
    "Effective dates determine which policy window applies. Auto mode resolves tax using your country and the selected effective-date period.",
  scope_hint_country_vs_region:
    "Scope decides whether rules apply at country level or by region. Use region only when local regulations differ from national defaults.",
  audit_log_explainer:
    "Reason entries are written to the audit log so reviewers can understand why an override or scope change was made.",
} as const;

export type TaxHelpCopyKey = keyof typeof TAX_HELP_COPY;
