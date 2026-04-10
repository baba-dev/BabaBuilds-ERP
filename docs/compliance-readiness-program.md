# Compliance Readiness Program

_Date: April 10, 2026_

## 1) Applicable framework scope by product footprint and customer segment

### Product footprint assumptions

| Product area | Description | Data sensitivity | Primary risk themes |
| --- | --- | --- | --- |
| Core ERP (Projects, Invoicing, Billing, Ledger, Reconciliation) | Multi-tenant web application for SMB operations | Moderate to high (financial records, customer PII, business metadata) | Data integrity, unauthorized access, change control, backup resilience |
| Team and admin controls | User, role, and admin-level configurations | High | Privilege misuse, access provisioning/deprovisioning |
| File import and storage | Customer files and invoice artifacts | Moderate | Malware ingestion, data retention, evidence traceability |
| Integrations and notifications | Email/push/SMS/API handoffs | Moderate | Third-party dependency risk, data leakage |

### Customer segments and framework applicability

| Customer segment | Typical buying trigger | Required / expected framework(s) | Evidence expectation |
| --- | --- | --- | --- |
| SMB (domestic, non-regulated) | Vendor due diligence for trust/security | SOC 2 Type I (near-term), SOC 2 Type II (12-month target) | Security policy set, control operation logs, quarterly review minutes |
| Mid-market finance-sensitive | Procurement + infosec questionnaire | SOC 2 Type II + CSA CAIQ alignment (optional), ISO 27001 roadmap | Control matrix, risk register, vulnerability & incident metrics |
| Customers with EU data subjects | Contractual privacy requirements | GDPR readiness (controller/processor obligations), SCCs where needed | RoPA, DPA templates, data deletion workflow evidence |
| Payment-adjacent use cases | Handling limited card workflows via providers | PCI DSS SAQ-A scope reduction design | Network/data-flow narrative proving card data stays with PSP |

### Recommended phased framework stack

1. **Foundation (Quarter 1-2):** SOC 2 Trust Services Criteria (Security) as the primary control baseline.
2. **Expansion (Quarter 3-4):** SOC 2 Availability + Confidentiality; map controls to ISO 27001 Annex A for enterprise deals.
3. **Privacy overlay (parallel):** GDPR Article 5/28/30/32 operationalization for EU-facing tenants.
4. **Payments boundary control:** Maintain SAQ-A segmentation to avoid PCI scope expansion.

---

## 2) Unified control matrix (technical + process controls)

> Use this as the single source of truth in GRC tooling (or a versioned spreadsheet) with one control ID per row.

| Requirement family | Requirement objective | Technical controls | Process controls | Evidence source(s) | Owner |
| --- | --- | --- | --- | --- | --- |
| Access Management | Only authorized users have least-privilege access | SSO/MFA enforcement, RBAC, session timeout, privileged action logging | Joiner/mover/leaver workflow, quarterly access recertification | Identity provider exports, admin audit log, access review sign-offs | Engineering + IT Admin |
| Change Management | Production changes are reviewed, tested, approved | Protected branches, CI checks, deployment approvals, immutable artifacts | CAB-lite weekly review, emergency change procedure, post-deploy verification | Pull request history, CI logs, deployment logs, change tickets | Engineering |
| Logging & Monitoring | Detect and investigate anomalous behavior | Centralized application/system logs, alerting rules, integrity-preserving log storage | Daily alert triage, incident escalation runbook | SIEM exports, on-call records, alert closure notes | Security/Platform |
| Incident Response | Incidents are triaged, contained, remediated, and learned from | Incident channel automation, severity tagging, timeline tracking | Incident response plan, tabletop exercises, PIR within SLA | Incident tickets, timeline docs, PIR templates | Security |
| Vulnerability Management | Vulnerabilities are discovered and remediated within SLA | SAST/DAST/dependency scans, container/image scanning, patch automation | Risk-based SLA policy, exception approvals, weekly vuln review | Scan reports, ticket aging reports, exception register | Security + Engineering |
| Backup & Recovery | Data can be restored within stated RPO/RTO | Scheduled backups, encrypted storage, point-in-time recovery, restore automation | Quarterly restore drills, backup retention review | Backup job logs, restore drill records, RTO/RPO attestations | Platform/DBA |
| Vendor & Third-Party Risk | External services are vetted and monitored | Secret rotation, scoped API tokens, integration monitoring | Vendor onboarding checklist, annual vendor reassessment | Vendor register, signed DPAs, security reviews | Security + Legal/Ops |
| Data Governance | Data is classified, retained, and deleted appropriately | Data tagging, retention jobs, deletion workflows, key management | Data classification policy, retention schedule approvals | Retention job logs, deletion request records, policy acknowledgments | Product + Security |

---

## 3) Gap assessment and prioritized remediation tickets

### Gap scoring model

Use a simple weighted model to prioritize remediation:

- **Impact (1-5):** Compliance/regulatory and customer trust impact.
- **Likelihood (1-5):** Probability of control failure.
- **Audit criticality (1-3):** Whether the control is audit-key.
- **Priority score = Impact × Likelihood × Audit criticality.**

### Initial prioritized ticket backlog

| Priority | Gap | Ticket description | Owner | Target due date | Success criteria |
| --- | --- | --- | --- | --- | --- |
| P0 | No formalized quarterly access recertification evidence package | Build automated user-role snapshot + reviewer signoff workflow each quarter | IT Admin Lead | May 15, 2026 | Q2 review package generated and approved on schedule |
| P0 | Incomplete documented emergency change process | Implement emergency change template with 24-hour retrospective approval rule | Engineering Manager | May 8, 2026 | 100% emergency changes reference ticket + retro approval |
| P1 | Vulnerability SLA reporting is not normalized across scanners | Create unified vuln SLA dashboard and aging alerts by severity | Security Engineer | May 29, 2026 | Weekly report auto-published; breaches create tickets automatically |
| P1 | Backup restore drills are ad hoc | Automate quarterly restore drill workflow + checklist and evidence archive | Platform Lead | June 12, 2026 | Two successful restore drills with documented RTO/RPO results |
| P2 | Vendor reassessment cadence is undefined | Add annual reassessment tracker and renewal gate in procurement process | Security Ops | June 30, 2026 | 100% critical vendors have current reassessment record |

---

## 4) Evidence automation plan

### Automation architecture

1. **Evidence collectors (scheduled jobs):** Pull source data from IdP, Git provider, ticketing tool, scanner APIs, backup platform.
2. **Normalizer:** Convert each source into a common evidence schema (`control_id`, `period`, `artifact_uri`, `owner`, `timestamp`, `integrity_hash`).
3. **Evidence vault:** Write immutable artifacts to versioned object storage.
4. **Control dashboard:** Show pass/fail/needs-review by control and period.

### Control-specific automation requirements

| Evidence domain | Automated collection method | Frequency | Control linkage | Exception handling |
| --- | --- | --- | --- | --- |
| Access reviews | Scheduled export of users/roles + reviewer attestation workflow | Quarterly + on-demand | Access Management | Missing reviewer signoff opens P1 ticket |
| Change approvals | PR metadata + deployment approval records | Daily | Change Management | Unapproved production deploy auto-flags incident |
| Incident records | Incident management API pull with severity, timeline, PIR | Daily | Incident Response | Missing PIR after SLA opens escalation |
| Vulnerability SLAs | Scanner ingestion + ticketing aging data | Daily | Vulnerability Management | SLA breach pages owning team |
| Backup restores | Backup job and restore drill logs with outcome status | Weekly + quarterly drill events | Backup & Recovery | Failed restore generates P0 corrective action |

### Implementation milestones

- **By April 24, 2026:** finalize common evidence schema + storage location.
- **By May 15, 2026:** deploy collectors for access, change, incident, vulnerability evidence.
- **By June 12, 2026:** add backup restore collector and drill evidence packager.
- **By June 30, 2026:** publish auditor-ready evidence export bundles per control family.

---

## 5) Compliance operating cadence

### Quarterly internal readiness review (every quarter)

**Week 1: Preparation**
- Regenerate unified control matrix status.
- Pull previous quarter remediation ticket closure metrics.
- Compile exceptions and risk acceptances.

**Week 2: Cross-functional review workshop**
- Participants: Engineering, Security, IT Admin, Product Ops, Leadership sponsor.
- Review control effectiveness, evidence completeness, SLA adherence.
- Re-score risks and reprioritize remediation backlog.

**Week 3: Action and signoff**
- Publish quarterly readiness report.
- Assign new/updated remediation tickets with owners and deadlines.
- Leadership signoff on residual risk position.

### Annual external audit preparation cycle

| Timeline | Activity | Deliverable |
| --- | --- | --- |
| T-90 days before audit start | Scope confirmation + control freeze window definition | Audit scope memo and control inventory |
| T-60 days | Evidence dry run and sampling rehearsal | Sample-ready evidence package |
| T-45 days | Policy refresh and exception closure sprint | Updated policies and closed exceptions log |
| T-30 days | Mock interviews and narrative alignment | Interview prep pack, system narratives |
| T-14 days | Final evidence QA and completeness check | Auditor request list mapped to artifacts |
| Audit period | Daily PBC tracking and response SLA monitoring | PBC tracker + issue log |
| Post-audit (within 30 days) | Findings remediation plan and owner assignment | CAPA plan with due dates |

## Governance KPIs (track monthly)

- Access review completion rate (% on time).
- Emergency change retrospective completion rate (% within 24h).
- Vulnerability SLA compliance by severity.
- Backup restore drill success rate.
- Incident PIR completion within policy SLA.
- Control evidence completeness score (% controls with current artifacts).
