# Security data protection review (2026-04-10)

## Scope

This review captures the current control posture for:

1. data sensitivity classification,
2. TLS and certificate controls,
3. at-rest encryption,
4. audit-log leakage prevention, and
5. key management lifecycle controls.

---

## 1) Data classification by sensitivity

### Classified data inventory (application-level)

| Category | Examples in this codebase | Primary storage locations | Required handling |
| --- | --- | --- | --- |
| **PII** | user email, phone, address, IP, user-agent | `User`, `BusinessProfile`, `Client`, `AppActivityLog` | Access-scoped to workspace, avoid log exposure, encrypt backups |
| **PAN / tax identifiers** | `panNumber`, `gstin`, `taxId`, `udyamNumber` | `BusinessProfile`, `Client` | Treat as restricted; redact in logs and exports by default |
| **Banking details** | `bankName`, `accountName`, `accountNumber`, `ifscCode` | `BusinessProfile` | Restricted access + field-level masking in UI/log pipelines |
| **Payroll-like/compensation metadata** | values logged under `salary`/`payroll` metadata keys | `AppActivityLog.metadata` | Sensitive logging rules + retention limits |
| **Credentials/secrets** | OAuth tokens, SMTP password, payment gateway secret keys, API keys | `Account`, `BusinessProfile` | Encrypt at rest, never log plaintext, rotate on schedule |

### Evidence

- Sensitive business/tax/bank fields are persisted in Prisma models (`BusinessProfile`, `Client`, `Account`).
- Payment gateway secrets are explicitly marked as encrypted blobs in schema comments.

---

## 2) TLS coverage, cipher policy, and certificate lifecycle

### Current state

- External callbacks and API endpoints are configured with HTTPS URLs in deployment guidance.
- SMTP transport now enforces:
  - minimum TLS version `TLSv1.2`,
  - strict certificate validation (`rejectUnauthorized: true`), and
  - explicit modern cipher preference list.

### Remaining controls to verify outside app code (infra)

- Certificate lifecycle automation (issuance, renewal, and expiry alerting).
- TLS for internal service-to-service traffic (DB/cache/queue endpoints).
- Runtime validation that ingress proxies preserve `X-Forwarded-Proto=https`.

---

## 3) At-rest encryption posture

### Implemented

- Application-level AES-256-GCM encryption is used for sensitive stored secrets via `lib/encryption.ts`.
- SMTP password decryption path supports migrated encrypted values, with a legacy fallback for old plaintext records.

### Must be validated at infrastructure layer

- Database volume encryption.
- Object storage encryption (invoice files, logos, documents).
- Cache/queue persistence encryption.
- Snapshot/backup encryption and restore-path controls.

> Note: these controls are cloud/provider-config driven and not fully inferable from this repository alone.

---

## 4) Audit-log leakage prevention

### Hardening completed

- `sanitizeMetadata` denylist now includes high-sensitivity key names for:
  - PAN/tax IDs,
  - bank/routing identifiers,
  - payroll/salary,
  - credentials/secrets.
- Added value-pattern redaction for likely PAN/IBAN/IFSC/account-number strings when they appear in arbitrary metadata strings.

### Follow-up

- Add detection test fixtures for false-positive/false-negative redaction cases.
- Evaluate tokenization for analytics pipelines where deterministic joins are needed without plaintext values.

---

## 5) Key management review (KMS/HSM, rotation, access, break-glass)

### Current state in code

- `ENCRYPTION_KEY` is required in production and validated for 32-byte hex format.
- Development fallback key is explicitly warning-only and non-production.

### Required operational controls (to document/runbook)

- Back `ENCRYPTION_KEY` and other runtime secrets from KMS/HSM (not static env files).
- Define rotation intervals (recommended: 90 days for app secrets, immediate upon incident).
- Enforce least-privilege secret access policies by environment and workload identity.
- Establish break-glass process:
  - dual approval,
  - time-bound elevated access,
  - mandatory post-incident key rotation and audit review.

---

## Priority remediation checklist

- [x] Strengthen SMTP TLS policy in transport creation.
- [x] Expand activity-log redaction for financial/tax/payroll-sensitive payloads.
- [ ] Add automated tests for metadata redaction edge cases.
- [ ] Publish infra evidence for encryption-at-rest coverage (DB/object/cache/queue/backups).
- [ ] Publish certificate lifecycle + KMS rotation + break-glass runbooks.
