# Tax Override Rollout QA Checklist

This document tracks rollout and validation for tax override controls and estimation-path safeguards.

## Feature flags

- `tax.override_ui.enabled`
- `tax.audit.enabled`
- `tax.provider.stripe.enabled`

## Rollout plan

1. **Enable for internal workspace only.**
   - Set `TAX_OVERRIDE_ROLLOUT_PHASE=1`.
   - Configure internal workspace targeting with either:
     - `TAX_OVERRIDE_INTERNAL_WORKSPACE_IDS=<workspace-id-1>,<workspace-id-2>`
     - `TAX_OVERRIDE_INTERNAL_WORKSPACE_NAMES=<name-1>,<name-2>`
2. **Validate decision parity between old and new estimator for IN scenarios.**
   - Compare tax decision outputs for India (`countryCode=IN`) across representative service mixes.
   - Include edge cases around empty service rates, mixed service rates, and explicit override values.
3. **Enable audit logging.**
   - Move to `TAX_OVERRIDE_ROLLOUT_PHASE=3` after parity sign-off.
   - Verify audit events are captured for override-path decisions.
4. **Enable workspace overrides.**
   - Move to `TAX_OVERRIDE_ROLLOUT_PHASE=4`.
   - Add selected workspace IDs to `TAX_OVERRIDE_OVERRIDE_UI_WORKSPACE_IDS`.
5. **Optionally enable provider mode for selected workspaces.**
   - Move to `TAX_OVERRIDE_ROLLOUT_PHASE=5`.
   - Add selected workspace IDs to `TAX_OVERRIDE_PROVIDER_STRIPE_WORKSPACE_IDS`.

## QA checklist

- [ ] Date-boundary checks
  - Validate around financial-year boundaries (e.g., March/April transition).
  - Validate custom invoice date input uses the expected taxable period.
- [ ] Precedence checks (`override > provider > fallback`)
  - Override path wins when explicit override is supplied.
  - Provider mode is used only when enabled and override is absent.
  - Fallback estimator is used when neither override nor provider applies.
- [ ] Regression checks for existing tax page calculations
  - Verify old tax planner totals remain unchanged when feature flags are off.
  - Verify non-IN workspaces preserve existing behavior.
- [ ] API contract snapshot examples for each mode
  - Fallback mode snapshot.
  - Override mode snapshot.
  - Provider mode snapshot.

## Example API contract snapshots

Use these examples as baseline fixtures for regression tests and manual QA.

### 1) Fallback mode

```json
{
  "taxRate": 0.18,
  "taxMode": "taxable",
  "source": "service_code",
  "requiresUserInput": false
}
```

### 2) Override mode

```json
{
  "taxRate": 0.12,
  "taxMode": "taxable",
  "source": "override",
  "requiresUserInput": false
}
```

### 3) Provider mode (Stripe)

```json
{
  "taxRate": 0.18,
  "taxMode": "taxable",
  "source": "provider",
  "provider": "stripe",
  "requiresUserInput": false
}
```
