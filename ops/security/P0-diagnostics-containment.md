# P0 diagnostics RCE containment and recovery

The legacy `/api/diagnostics/` namespace must never be internet-accessible. Apply the edge block first; application deployment is defense in depth and introduces authenticated admin-only analysis/approval endpoints under `/api/admin/diagnostics/`.

## 1. Immediate containment

### Nginx/origin

Copy `ops/nginx/deny-public-diagnostics.conf` to a root-owned Nginx snippets directory and include it inside every public `server {}` block, before generic `location /` proxying.

```bash
sudo install -o root -g root -m 0644 ops/nginx/deny-public-diagnostics.conf /etc/nginx/snippets/deny-public-diagnostics.conf
sudo nginx -t
sudo systemctl reload nginx
```

Add this line to each applicable public server block if it is not already managed by deployment automation:

```nginx
include /etc/nginx/snippets/deny-public-diagnostics.conf;
```

Test both the Cloudflare hostname and the origin directly (with the correct `Host` header). Every method and every path below the prefix must return `404`, never a Next.js response:

```bash
curl -i -X POST https://ERP_HOST/api/diagnostics/log
curl -i -X POST https://ERP_HOST/api/diagnostics/analyze
curl -i -X POST https://ERP_HOST/api/diagnostics/remediate
curl -i -X POST https://ERP_HOST/api/diagnostics/user-message
curl -i -X POST -H 'Host: ERP_HOST' https://ORIGIN_IP/api/diagnostics/remediate
```

### Cloudflare

Create a highest-priority custom WAF rule with action **Block**:

```text
(http.request.uri.path eq "/api/diagnostics" or starts_with(http.request.uri.path, "/api/diagnostics/"))
```

Do not rely on a JavaScript challenge, rate limit, IP reputation, or obscured URL for this P0.

## 2. Deploy the application fix

The fix has four hard boundaries:

1. Legacy public handlers return `404` even if the edge rule is removed.
2. AI analysis is synchronous and super-admin-only at `/api/admin/diagnostics/analyze`; internal logging no longer calls an HTTP analysis endpoint.
3. The model can only recommend typed `RESTART_WEB` or `BLOCK_IPV4` payloads. Code patches, data scripts, SQL, paths, command strings, and extra JSON fields are rejected.
4. `/api/admin/diagnostics/approve` verifies both a fresh database-backed super-admin role and a short-lived Ed25519 signature created off-host. It records approval only. The Next.js process imports no process-execution or patch-application capability.

Set these deployment values before enabling the admin workflow:

- `SUPERADMIN_EMAILS`: explicit comma-separated super-admin allowlist. There is no default.
- `DIAGNOSTICS_APPROVAL_PUBLIC_KEY`: the Ed25519 public key PEM. This is verification-only and is safe to place on the web host.

Generate the signing key on a separate secured admin machine, not on the ERP/web VPS:

```bash
umask 077
openssl genpkey -algorithm ED25519 -out diagnostics-approval-private.pem
openssl pkey -in diagnostics-approval-private.pem -pubout -out diagnostics-approval-public.pem
```

Never copy `diagnostics-approval-private.pem` to the web host, source repository, CI, deployment environment, password manager shared with the web runtime, or database.

## 3. Out-of-band approval and execution

An administrator reviews the stored typed JSON payload and saves its exact bytes to a local file. On the secured signing machine:

```bash
node scripts/sign-diagnostics-approval.mjs \
  --remediation-id REMEDIATION_ID \
  --content-file remediation.json \
  --private-key-file /secure/diagnostics-approval-private.pem \
  > approval.json
```

While signed in as a configured database-backed super-admin, submit `approval.json` to `/api/admin/diagnostics/approve`. The signature expires in five minutes by default and is bound to the remediation ID plus exact SHA-256 payload hash.

Approval does not execute anything. A separate `erp-remediator` operator account must explicitly run:

```bash
npx tsx scripts/diagnostics-remediation-worker.ts REMEDIATION_ID
```

The worker accepts exactly one approved ID and invokes fixed binaries with fixed argument arrays and `shell: false`. Install a reviewed build as a root-owned artifact and run it through a separately managed one-shot service or operator account. Grant only the exact systemd restart authorization and CrowdSec local-API access it needs. Do **not** use a sudoers wildcard for the IP argument: sudo command wildcards can span argument boundaries. Keep the worker identity unable to edit the application, worker, dependencies, systemd unit, approval public key, or database except for the narrowly scoped remediation state transition. If those separations cannot be enforced, leave worker execution disabled and perform the reviewed operation manually.

## 4. Exposure review and secret rotation

Preserve logs and a database copy before cleanup. Establish the first/last internet-accessible deployment window, then review:

- Cloudflare Security Events and HTTP request logs for the four legacy paths, query strings, source IPs, user agents, request sizes, and bursts.
- Nginx access/error logs (including rotated/compressed files) for `/api/diagnostics/`; treat any `2xx`, `202`, or `500` on `remediate` as suspicious.
- `SystemErrorLog` and `SystemRemediation` rows created during the exposure window. Escalate all `EXECUTING`, `SUCCESS`, or `FAILED` rows and any content that is not one of the two typed JSON payloads.
- `journalctl` for the Next.js service, systemd/PM2 restart history, CrowdSec decisions, sudo/auth logs, process crashes, outbound connections, new files, modified application files, unexpected git state, cron/systemd timers, SSH keys, and new users.
- Groq audit/usage logs for unusual volume and prompts attributable to anonymous ingestion.

Example SQLite triage (run against a preserved copy and adjust the database path):

```sql
SELECT id, createdAt, route, method, errorType, message
FROM SystemErrorLog
WHERE createdAt >= 'EXPOSURE_START_UTC'
ORDER BY createdAt;

SELECT id, errorLogId, actionType, status, content, executedAt, executedBy, executionLog, createdAt, updatedAt
FROM SystemRemediation
WHERE createdAt >= 'EXPOSURE_START_UTC'
   OR executedAt IS NOT NULL
   OR status IN ('EXECUTING', 'SUCCESS', 'FAILED')
ORDER BY createdAt;
```

If the vulnerable build was reachable from the internet, rotate at minimum:

- `NEXTAUTH_SECRET` and invalidate all sessions;
- `GROQ_API_KEY`;
- database credentials or replace/re-permission the SQLite database and host account as appropriate;
- SMTP/email credentials, Google OAuth secret, payment-provider/API and webhook secrets, storage credentials, encryption keys, deploy/CI tokens, GitHub deploy keys, SSH keys, and any other secret readable by the web-process account;
- the offline approval key only if it was ever generated or stored on the affected host.

Rotate from a known-clean administration device. Revoke old credentials first where possible, deploy replacements through the normal secret store, restart cleanly, and verify old credentials no longer work. Do not delete suspicious remediation rows or logs until incident review and evidence preservation are complete.
