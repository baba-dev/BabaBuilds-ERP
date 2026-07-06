# High-risk role authentication policy

BabaBuilds ERP treats the following workspace business roles as high-risk because they can administer the workspace, manage sensitive finance workflows, or grant elevated access to other users:

- `OWNER`
- `ADMIN`
- `FINANCE_MANAGER`

## Required sign-in methods

High-risk roles must use a phishing-resistant sign-in method:

1. **Passkey / WebAuthn** (`passkey-login`) — always accepted for high-risk roles because the login is bound to the relying party and verified by the user's authenticator.
2. **Google** (`google`) — accepted when Google remains in `PHISHING_RESISTANT_PROVIDERS`. This is the default policy because the application treats Google sign-in as an approved phishing-resistant provider for privileged users.
3. **Enterprise SSO** (`azure-ad`, `okta`, or another provider explicitly listed in `PHISHING_RESISTANT_PROVIDERS`) — accepted only when the provider ID is present in the allowlist.

## Restricted sign-in methods

The following methods are not sufficient on their own for `OWNER`, `ADMIN`, or `FINANCE_MANAGER` accounts:

- **Password-only sign-in** (`password-login`) is blocked unless the session is created through an approved phishing-resistant flow such as passkey sign-in.
- **Email magic link sign-in** (`email`) is blocked for high-risk roles, except for explicitly configured break-glass addresses in `MAGIC_LINK_EXCEPTION_EMAILS`.

## Configuration

- `PHISHING_RESISTANT_PROVIDERS` is a comma-separated allowlist. Defaults: `google,azure-ad,okta,passkey-login`.
- `MAGIC_LINK_EXCEPTION_EMAILS` is a comma-separated list for break-glass email magic-link exceptions. Keep this list short and monitor its use.

## Operational guidance

- Require every `OWNER`, `ADMIN`, and `FINANCE_MANAGER` to register at least one passkey before relying on password fallback.
- If Google is removed from `PHISHING_RESISTANT_PROVIDERS`, high-risk users must use passkeys or another configured enterprise SSO provider.
- Review auth failure telemetry for `HIGH_RISK_PASSWORD_BLOCKED`, `HIGH_RISK_MAGIC_LINK_BLOCKED`, and `MFA_POLICY_BLOCK` to identify users who need passkey or Google enrollment support.
