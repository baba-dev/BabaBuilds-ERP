# Auth & Access Control Audit (2026-04-10)

## Scope
1. MFA coverage for admin and finance roles, with phishing-resistant enforcement for highest-risk roles.
2. Password, lockout, device trust, token expiry/rotation, and session revocation controls.
3. SSO/OIDC role provisioning and deprovisioning behavior.
4. Privilege escalation and session fixation/hijack protections.
5. Continuous alerting for anomalous auth and privilege events.

## Findings and changes shipped

### 1) MFA coverage and phishing-resistant requirements
- **Implemented**: high-risk workspace roles (`OWNER`, `ADMIN`) are now blocked from signing in unless the auth provider is in the phishing-resistant allowlist (`PHISHING_RESISTANT_PROVIDERS`, defaults include `google`, `azure-ad`, `okta`).
- **Behavior**: blocked attempts are recorded as auth failures (`MFA_POLICY_BLOCK`) and feed existing repeated-failure alerting.

### 2) Password/lockout/session controls
- **Session hardening implemented**:
  - JWT and session max age reduced to **8 hours**.
  - Session rolling refresh window (`updateAge`) set to **30 minutes**.
- **Brute-force signals**:
  - Existing repeated auth failure thresholds continue to trigger webhook alerts.
- **Residual gap**:
  - No persistent, per-IP lockout table yet.
  - Device trust and explicit refresh-token rotation are limited by current NextAuth JWT strategy.

### 3) SSO/OIDC provisioning/deprovisioning and JIT access
- **Implemented JIT-style provisioning**:
  - During sign-in, unexpired workspace invites for the user email are consumed and converted into `workspaceUser` memberships.
  - Invite rows are deleted after provisioning.
- **Deprovisioning behavior**:
  - Team removal endpoints continue to remove workspace membership; revoked users lose access on subsequent authorization checks.

### 4) Privilege escalation and session protections
- **Implemented**: elevated role grants (`OWNER` / `ADMIN`) via invite now emit critical alerts to webhook.
- **Session fixation/hijack posture**:
  - Shorter session max age and rolling updates reduce replay window.
  - Residual recommendation: add server-side session versioning or explicit revocation timestamp at `User` level for immediate global logout.

### 5) Continuous anomaly alerts
- **Implemented / active**:
  - Repeated auth failures (existing) -> critical alert.
  - Elevated privilege grants (new) -> critical alert.
- **Residual recommendation**:
  - Impossible travel requires reliable IP geo capture on auth callback path and a persisted login telemetry table.

## Operational notes
- Configure `APP_ACTIVITY_ALERT_WEBHOOK_URL` to receive alerts.
- Configure `PHISHING_RESISTANT_PROVIDERS` (comma-separated provider IDs) to align with enterprise IdP policy.
