# BabaBuilds ERP — Global Tax Data Foundation (Implementation-Oriented)

## 1) Layered Tax Data Architecture

This architecture separates **framework metadata** (what kind of tax data can exist) from **jurisdiction content** (what values are true for a specific country/state/period) and from **workspace operations** (what a customer actually filed or needs to file).

### Layer L0 — Governance, Provenance, and Version Control (cross-cutting)
Purpose: ensure every tax rule/value is traceable, time-bound, reviewable, and auditable.

Core entities:
- `TaxSourceDocument`
- `TaxKnowledgeVersion`
- `TaxRecordValidity`
- `TaxReviewWorkflow`
- `TaxChangeEvent`
- `TaxApplicabilityScope`

Without this layer, tax data becomes opaque and legally risky.

### Layer L1 — Global Tax Knowledge Model (country-agnostic framework)
Purpose: canonical vocabulary and structures shared across countries.

Core entities:
- `Country`, `Jurisdiction`
- `TaxRegime`
- `TaxType`
- `RegistrationType`
- `TaxpayerClassification`
- `IncomeCategory`
- `DeductionCategory`
- `CreditCategory`
- `TaxForm`, `TaxFormSection`, `TaxFormField`
- `FilingFrequency`, `DeadlineRuleTemplate`
- `ComputationMethod` (regular/progressive/withholding/presumptive/etc.)

This prevents country packs from becoming custom one-off schemas.

### Layer L2 — Country Packs (jurisdiction content)
Purpose: per-country/per-jurisdiction tax rules, forms, thresholds, rates, due dates, and mappings.

Core entities:
- `CountryPack`
- `JurisdictionTaxRule`
- `TaxRateSchedule`
- `TaxThresholdRule`
- `FormRequirementRule`
- `FilingCalendarRule`
- `ClassificationMappingRule`
- `PresumptiveSchemeRule`
- `WithholdingRule`
- `ForeignIncomeRule`

A country pack is **versioned content** that can be updated independently from code.

### Layer L3 — Workspace Tax Profile & Elections
Purpose: store tax identity and configuration for each workspace/business.

Core entities:
- `WorkspaceTaxProfile`
- `WorkspaceTaxRegistration`
- `WorkspaceTaxElection`
- `WorkspaceNexus`
- `WorkspaceTaxResidency`
- `WorkspaceTaxOverride` (existing + extended)

This drives obligation creation and transaction tax treatment.

### Layer L4 — Transaction-Level Tax Facts (operational records)
Purpose: immutable tax facts derived from invoices/expenses/bank records plus decision logs.

Core entities:
- `TaxableEvent`
- `TaxDetermination`
- `TaxComponentLine`
- `WithholdingEvent`
- `TaxCreditEvent`
- `TaxDecisionAuditLog` (existing + expanded refs)

This is the evidence layer for later returns and audits.

### Layer L5 — Obligations, Periods, Returns, and Filing Readiness
Purpose: turn tax facts + profile into period obligations and prefilled return drafts.

Core entities:
- `TaxObligation`
- `TaxPeriod`
- `TaxReturn`
- `TaxReturnFieldValue`
- `ReturnReconciliationItem`
- `ReadinessCheck`
- `ReadinessBlocker`
- `ComplianceTask`

This powers dashboard tasks, reminders, and filing workflows.

### Layer L6 — Cross-Border, Withholding, Credits, Presumptive Analysis
Purpose: advanced tax support beyond basic transaction tax.

Core entities:
- `ForeignIncomeRecord`
- `ForeignTaxPaidRecord`
- `ForeignTaxCreditClaim`
- `WithholdingCertificate`
- `TaxCreditLedger`
- `PresumptiveComparisonScenario`
- `PresumptiveComparisonResult`

Supports India Form 67-like workflows and future global FTC/treaty modeling.

### Layer L7 — Import/Ingestion and Document Linkage
Purpose: structured import pipelines and traceability to original evidence.

Core entities:
- `ImportTemplate`
- `ImportTemplateField`
- `ImportMappingRule`
- `ImportBatch`
- `ImportRow`
- `TaxDocumentLink`
- `DocumentExtractionResult`

Enables bulk onboarding, recurring compliance imports, and AI-assisted prefill later.

---

## 2) Detailed Dataset/Entity Inventory + Key Fields

> Field naming is illustrative and implementation-friendly (UUID PKs assumed).

## L0. Governance / Provenance / Versioning (Cross-cutting)

### `TaxSourceDocument`
- `id`
- `source_type` (official_gazette, tax_authority_portal, circular, internal_analysis, partner_advisory)
- `title`
- `issuing_authority`
- `source_url`
- `publication_date`
- `retrieved_at`
- `jurisdiction_id` (nullable for global)
- `language_code`
- `document_hash`
- `storage_document_id` (link to vault)
- `citation_notes`

### `TaxKnowledgeVersion`
- `id`
- `country_pack_id`
- `version_code` (e.g., `IN-2026.04.1`)
- `effective_from`
- `effective_to` (nullable)
- `status` (draft, verified, deprecated, superseded)
- `verification_level` (unverified, secondary_validated, primary_source_validated)
- `approved_by_user_id` (nullable)
- `approved_at` (nullable)
- `change_summary`

### `TaxRecordValidity` (attachable metadata for rule/value tables)
- `id`
- `entity_type`
- `entity_id`
- `effective_from`
- `effective_to`
- `supersedes_entity_id` (nullable)
- `knowledge_version_id`
- `confidence_score` (0–1)
- `is_active`

### `TaxReviewWorkflow`
- `id`
- `entity_type`
- `entity_id`
- `review_status` (pending, in_review, approved, rejected)
- `review_notes`
- `reviewed_by`
- `reviewed_at`

### `TaxChangeEvent`
- `id`
- `change_type` (rate_change, form_change, due_date_change, threshold_change, interpretation_note)
- `jurisdiction_id`
- `detected_at`
- `announced_effective_date`
- `impact_level` (low/medium/high)
- `requires_workspace_recompute` (bool)
- `source_document_id`

### `TaxApplicabilityScope`
- `id`
- `country_id`
- `subdivision_id` (nullable)
- `city_or_local_area` (nullable)
- `tax_type_id`
- `entity_class_filter` (json)
- `turnover_band_filter` (json)
- `industry_filter` (json)

---

## L1. Global Tax Knowledge Model

### `Country`
- `id`, `iso2`, `iso3`, `name`, `currency_code`, `default_language`, `timezone`

### `Jurisdiction`
- `id`
- `country_id`
- `jurisdiction_level` (national/state/province/local)
- `code` (state code etc.)
- `name`
- `parent_jurisdiction_id` (nullable)
- `active_from`, `active_to`

### `TaxRegime`
- `id`
- `code` (e.g., GST, VAT, INCOME_TAX, CORPORATE_TAX, SALES_TAX, WITHHOLDING)
- `name`
- `regime_category` (indirect/direct/payroll/withholding/customs)
- `description`

### `TaxType`
- `id`
- `regime_id`
- `code` (CGST, SGST, IGST, TDS_194C, US_FED_ESTIMATED_TAX)
- `name`
- `calculation_basis` (transaction_value, net_income, deemed_income, payroll, import_value)
- `recoverability_type` (creditable/non_creditable/partial)

### `RegistrationType`
- `id`
- `tax_type_id`
- `code`
- `name`
- `registration_number_pattern` (nullable)
- `supports_composition_or_simplified_scheme` (bool)

### `TaxpayerClassification`
- `id`
- `domain` (legal_entity, taxpayer_type, business_size, residency, sector)
- `code`
- `name`
- `description`

### `TaxForm`
- `id`
- `country_id`
- `code` (ITR1/ITR2/ITR3/ITR4/FORM67 etc.)
- `name`
- `tax_type_id`
- `filing_mode` (online/upload/api/manual)
- `is_return` (bool)
- `is_statement` (bool)

### `TaxFormSection`
- `id`, `form_id`, `section_code`, `title`, `display_order`

### `TaxFormField`
- `id`
- `form_id`
- `section_id`
- `field_code`
- `label`
- `data_type` (string/number/date/boolean/enum/json)
- `unit` (currency, percent, count)
- `required_rule_expr` (nullable)
- `validation_expr` (nullable)
- `prefill_source_hint` (invoice, expense, ledger, tds, foreign_income, manual)
- `sensitivity_level` (normal/high_pii/confidential)

### `FilingFrequency`
- `id`, `code` (monthly/quarterly/annual/ad_hoc), `period_pattern`

### `DeadlineRuleTemplate`
- `id`
- `code`
- `description`
- `rule_expression` (machine-evaluable DSL/JSON)
- `grace_rule_expression` (nullable)

### `ComputationMethod`
- `id`
- `code` (flat_rate, slab_rate, progressive, reverse_charge, presumptive_pct, withholding_pct)
- `description`

---

## L2. Country Pack Data

### `CountryPack`
- `id`
- `country_id`
- `name`
- `version_id`
- `status`
- `supported_tax_areas` (json: {indirect:true, direct:true, withholding:true})

### `JurisdictionTaxRule`
- `id`
- `country_pack_id`
- `jurisdiction_id`
- `tax_type_id`
- `rule_code`
- `rule_name`
- `rule_logic_json`
- `computation_method_id`
- `effective_from`, `effective_to`

### `TaxRateSchedule`
- `id`
- `jurisdiction_tax_rule_id`
- `rate_kind` (standard/reduced/zero/exempt/surcharge/cess)
- `rate_percent`
- `applies_to_classification` (json)
- `effective_from`, `effective_to`
- `source_document_id`

### `TaxThresholdRule`
- `id`
- `jurisdiction_tax_rule_id`
- `threshold_type` (registration, filing_trigger, surcharge_trigger, exemption_limit, presumptive_eligibility)
- `amount`
- `currency`
- `measurement_basis` (gross_turnover, taxable_turnover, net_income, payment_amount)
- `aggregation_window` (monthly/annual/rolling_12m)
- `effective_from`, `effective_to`

### `FormRequirementRule`
- `id`
- `country_pack_id`
- `form_id`
- `applicability_expr`
- `priority`
- `effective_from`, `effective_to`

### `FilingCalendarRule`
- `id`
- `country_pack_id`
- `tax_type_id`
- `frequency_id`
- `deadline_template_id`
- `jurisdiction_id`
- `applies_if_expr`

### `ClassificationMappingRule`
- `id`
- `country_pack_id`
- `source_domain` (service_category, product_hsn, income_head, entity_type)
- `source_code`
- `target_tax_classification_code`
- `mapping_logic`
- `effective_from`, `effective_to`

### `PresumptiveSchemeRule`
- `id`
- `country_pack_id`
- `scheme_code`
- `description`
- `eligible_entity_expr`
- `deemed_income_formula`
- `turnover_cap`
- `locking_conditions`
- `effective_from`, `effective_to`

### `WithholdingRule`
- `id`
- `country_pack_id`
- `withholding_code`
- `payer_type_expr`
- `payee_type_expr`
- `payment_nature_expr`
- `rate_percent`
- `threshold_amount`
- `certificate_required` (bool)
- `deposit_deadline_template_id`
- `return_form_id` (nullable)

### `ForeignIncomeRule`
- `id`
- `country_pack_id`
- `rule_code`
- `income_category`
- `is_disclosure_required`
- `credit_method` (ordinary_credit/exemption/deduction)
- `documentation_requirements_json`
- `related_form_id` (e.g., Form 67)

---

## L3. Workspace Tax Profile & Elections

### `WorkspaceTaxProfile`
- `id`
- `workspace_id`
- `primary_country_id`
- `functional_currency`
- `book_year_start_month`
- `tax_year_basis`
- `legal_entity_type`
- `residency_status`
- `msme_status` (nullable)
- `constitution_code` (proprietorship/partnership/company)
- `tax_profile_status` (draft/active/inactive)

### `WorkspaceTaxRegistration`
- `id`
- `workspace_id`
- `jurisdiction_id`
- `registration_type_id`
- `registration_number`
- `registration_status` (active/pending/cancelled/suspended)
- `registered_from`
- `registered_to` (nullable)
- `certificate_document_id` (nullable)

### `WorkspaceTaxElection`
- `id`
- `workspace_id`
- `tax_type_id`
- `election_code` (composition_scheme, presumptive_opt_in, cash_basis, quarterly_filing_opt)
- `selected_value`
- `effective_from`, `effective_to`
- `supporting_document_id` (nullable)

### `WorkspaceNexus`
- `id`
- `workspace_id`
- `jurisdiction_id`
- `nexus_type` (physical/economic/employee/warehouse/digital)
- `trigger_date`
- `status`

### `WorkspaceTaxResidency`
- `id`
- `workspace_id`
- `country_id`
- `residency_type`
- `effective_from`, `effective_to`

### `WorkspaceTaxOverride` (extend existing)
- `id`
- `workspace_id`
- `scope_type` (invoice, line_item, client, service, tax_period, global)
- `scope_ref_id`
- `override_kind` (rate, exemption, classification, place_of_supply, withholding)
- `override_value_json`
- `reason_code`
- `reason_note`
- `approved_by`
- `effective_from`, `effective_to`
- `expires_on_condition` (nullable)

---

## L4. Operational Tax Records (Facts)

### `TaxableEvent`
- `id`
- `workspace_id`
- `source_type` (invoice, expense, bank_txn, payroll, journal)
- `source_id`
- `event_date`
- `counterparty_id`
- `jurisdiction_determined_id`
- `tax_point_date`
- `gross_amount`, `net_amount`, `currency`
- `exchange_rate_to_functional`
- `place_of_supply_data` (json)

### `TaxDetermination`
- `id`
- `taxable_event_id`
- `decision_engine_version`
- `country_pack_version_id`
- `classification_codes` (json)
- `applied_rules` (json rule IDs)
- `result_status` (final, manual_override, needs_review)
- `confidence_score`

### `TaxComponentLine`
- `id`
- `tax_determination_id`
- `tax_type_id`
- `rate_percent`
- `taxable_base`
- `tax_amount`
- `is_input_credit_eligible`
- `credit_restriction_reason` (nullable)

### `WithholdingEvent`
- `id`
- `workspace_id`
- `source_type`
- `source_id`
- `withholding_rule_id`
- `payee_party_id`
- `payment_date`
- `gross_payment_amount`
- `withheld_amount`
- `deposit_due_date`
- `deposit_status`

### `TaxCreditEvent`
- `id`
- `workspace_id`
- `tax_type_id`
- `origin_type` (input_tax, withholding, foreign_tax, carry_forward)
- `origin_ref_id`
- `credit_amount`
- `credit_currency`
- `recognized_period_id`
- `utilization_status`

---

## L5. Obligations, Returns, Readiness

### `TaxObligation`
- `id`
- `workspace_id`
- `tax_type_id`
- `jurisdiction_id`
- `trigger_source` (registration, threshold_crossed, manual)
- `status` (active, paused, ended)
- `effective_from`, `effective_to`

### `TaxPeriod`
- `id`
- `obligation_id`
- `period_start`
- `period_end`
- `due_date`
- `extended_due_date` (nullable)
- `period_status` (open, under_review, ready, filed, revised, closed)

### `TaxReturn`
- `id`
- `tax_period_id`
- `form_id`
- `return_version_no`
- `prepared_at`
- `prepared_by`
- `filing_status` (draft, ready, submitted, accepted, rejected)
- `ack_reference` (nullable)
- `filed_at` (nullable)

### `TaxReturnFieldValue`
- `id`
- `tax_return_id`
- `form_field_id`
- `value_json`
- `value_source` (system_prefill, import, manual, api_pull)
- `source_trace_json` (list of contributing records)
- `is_overridden`
- `override_reason`

### `ReturnReconciliationItem`
- `id`
- `tax_return_id`
- `check_code`
- `expected_value`
- `actual_value`
- `variance`
- `severity` (info/warn/blocker)
- `resolution_status`

### `ReadinessCheck`
- `id`
- `tax_period_id`
- `check_code`
- `check_category` (data_completeness, document_missing, mismatch, deadline_risk)
- `result` (pass/warn/fail)
- `details_json`
- `evaluated_at`

### `ReadinessBlocker`
- `id`
- `tax_period_id`
- `blocker_code`
- `description`
- `owner_user_id`
- `due_by`
- `status`

### `ComplianceTask`
- `id`
- `workspace_id`
- `tax_period_id` (nullable)
- `task_type` (collect_doc, review_return, pay_tax, deposit_withholding, file_form)
- `title`
- `due_date`
- `priority`
- `status`

---

## L6. Withholding / Credits / Foreign Income / Presumptive

### `WithholdingCertificate`
- `id`
- `workspace_id`
- `certificate_number`
- `issuer_party_id`
- `tax_type_id`
- `period_start`, `period_end`
- `certificate_date`
- `gross_amount`
- `tax_withheld_amount`
- `document_id`
- `verification_status`

### `TaxCreditLedger`
- `id`
- `workspace_id`
- `tax_type_id`
- `credit_origin_type`
- `origin_ref_id`
- `period_id`
- `opening_balance`
- `credits_added`
- `credits_utilized`
- `credits_expired`
- `closing_balance`

### `ForeignIncomeRecord`
- `id`
- `workspace_id`
- `country_id`
- `income_type`
- `source_description`
- `income_date`
- `gross_income_amount`
- `currency`
- `exchange_rate`
- `functional_currency_amount`
- `linked_document_id`

### `ForeignTaxPaidRecord`
- `id`
- `workspace_id`
- `foreign_income_record_id`
- `country_id`
- `tax_type_desc`
- `tax_paid_amount`
- `tax_paid_currency`
- `payment_date`
- `proof_document_id`

### `ForeignTaxCreditClaim`
- `id`
- `workspace_id`
- `tax_period_id`
- `domestic_form_id`
- `foreign_tax_paid_record_id`
- `claim_method`
- `claim_amount`
- `limitation_working_json`
- `claim_status`

### `PresumptiveComparisonScenario`
- `id`
- `workspace_id`
- `tax_year`
- `scheme_rule_id`
- `input_snapshot_json` (turnover, expense ratio, sector, asset data)
- `created_at`

### `PresumptiveComparisonResult`
- `id`
- `scenario_id`
- `method_code` (normal, presumptive_X)
- `estimated_taxable_income`
- `estimated_tax`
- `assumptions_json`
- `non_numeric_flags_json` (eligibility risks, lock-in implications)

---

## L7. Import Templates / Ingestion / Document Linkage

### `ImportTemplate`
- `id`
- `country_id` (nullable)
- `tax_domain` (returns/withholding/foreign_income/registrations)
- `template_code`
- `name`
- `file_type` (csv/xlsx/json)
- `version`
- `status`

### `ImportTemplateField`
- `id`
- `template_id`
- `field_key`
- `label`
- `data_type`
- `required`
- `validation_rule`
- `maps_to_entity`
- `maps_to_field`

### `ImportMappingRule`
- `id`
- `template_id`
- `source_column`
- `target_path`
- `transform_expression`
- `default_value`

### `ImportBatch`
- `id`
- `workspace_id`
- `template_id`
- `uploaded_by`
- `uploaded_at`
- `status`
- `row_count`
- `error_count`
- `source_file_document_id`

### `ImportRow`
- `id`
- `batch_id`
- `row_number`
- `raw_payload_json`
- `parse_status`
- `validation_errors_json`
- `created_entity_refs_json`

### `TaxDocumentLink`
- `id`
- `workspace_id`
- `document_id`
- `linked_entity_type`
- `linked_entity_id`
- `document_role` (invoice_support, withholding_cert, residency_proof, return_ack)
- `linked_at`

### `DocumentExtractionResult`
- `id`
- `document_id`
- `extractor_version`
- `extracted_fields_json`
- `confidence_json`
- `human_verified`
- `verified_by`

---

## 3) India, Oman, USA Readiness (Data Coverage Perspective)

## India (depth-first target)
This model can support:
- ITR1–ITR4 as `TaxForm` + `TaxFormField` sets with applicability rules in `FormRequirementRule`.
- Form 67-style foreign tax claim documentation via `ForeignIncomeRecord`, `ForeignTaxPaidRecord`, `ForeignTaxCreditClaim`, `TaxDocumentLink`.
- TDS lifecycle via `WithholdingRule`, `WithholdingEvent`, `WithholdingCertificate`, `TaxCreditLedger`.
- Presumptive taxation comparisons via `PresumptiveSchemeRule` + comparison scenario/result entities.
- Sole proprietor/MSME flows via `WorkspaceTaxProfile` (`constitution_code`, `msme_status`), classification rules, and registration/election records.

## Oman
This model can support:
- VAT + corporate tax through separate `TaxType`, `JurisdictionTaxRule`, `TaxRateSchedule`, and filing calendar rules.
- Business registration and obligation tracking via `WorkspaceTaxRegistration` + `TaxObligation`.
- Return preparation with localized forms via `TaxForm`/`TaxReturnFieldValue`.

## USA
This model can support:
- Federal + state/local structure using nested `Jurisdiction` and `TaxApplicabilityScope`.
- Sole proprietor/small business direct tax tracking via classifications + tax obligations + estimated payment compliance tasks.
- Sales-tax-adjacent extensibility through indirect-tax `TaxType` and jurisdictional rate/threshold rules.

Important boundary: jurisdiction-specific legal logic (eligibility tests, form fields, exact formulas, deadlines) must be loaded as verified country-pack content and continuously maintained, not hardcoded as assumed truth.

---

## 4) ERP Integration Mapping (What connects to what)

- **Invoices / services / products** → `TaxableEvent`, `TaxDetermination`, `TaxComponentLine`, `ClassificationMappingRule`.
- **Expenses** → input tax eligibility + tax credit events + return prefill traces.
- **Bank transactions/reconciliation** → tax payment detection, withholding deposits, estimated-tax payments, outstanding compliance tasks.
- **Clients/vendors** → counterparty tax classification, withholding applicability, place-of-supply logic.
- **Proposal-to-paid records** → tax point timing, accrual vs cash-basis elections.
- **Document vault** → `TaxDocumentLink`, source proofs, acknowledgements, certificates.
- **Dashboard/tasks/reminders** → `ComplianceTask`, `ReadinessCheck`, due-date engine from `FilingCalendarRule`.
- **AI prefill future** → `TaxFormField.prefill_source_hint` + `TaxReturnFieldValue.source_trace_json` + `DocumentExtractionResult`.

---

## 5) Viable Tax Database for BabaBuilds v1 (minimum but strong)

Implement first:

1. **Core framework:** `Country`, `Jurisdiction`, `TaxRegime`, `TaxType`, `TaxForm`, `TaxFormField`, `FilingFrequency`.
2. **Version/provenance:** `TaxSourceDocument`, `TaxKnowledgeVersion`, effective date fields on all rule tables.
3. **Country pack essentials:** `CountryPack`, `JurisdictionTaxRule`, `TaxRateSchedule`, `TaxThresholdRule`, `FilingCalendarRule`, `FormRequirementRule`.
4. **Workspace setup:** `WorkspaceTaxProfile`, `WorkspaceTaxRegistration`, `WorkspaceTaxElection`, extend current override tables.
5. **Operational tax facts:** `TaxableEvent`, `TaxDetermination`, `TaxComponentLine`, `WithholdingEvent`.
6. **Compliance flow:** `TaxObligation`, `TaxPeriod`, `TaxReturn`, `TaxReturnFieldValue`, `ReadinessCheck`, `ComplianceTask`.
7. **Documents/import:** `TaxDocumentLink`, `ImportTemplate`, `ImportBatch`, `ImportRow`.

Why this is viable: It supports end-to-end compute → period obligation → return draft → readiness checks with auditable source/version context.

---

## 6) Future Expansion Data Model (phase 2+)

Add next:
- `ClassificationMappingRule` advanced mappings by industry/product taxonomy.
- `TaxReviewWorkflow`, `TaxChangeEvent`, automated impact re-computation.
- `TaxCreditLedger` and carry-forward/expiry mechanics.
- Full cross-border suite (`ForeignIncomeRecord`, `ForeignTaxPaidRecord`, `ForeignTaxCreditClaim`).
- Presumptive decision intelligence (`PresumptiveComparisonScenario/Result`).
- `DocumentExtractionResult` + model-driven assisted prefill.
- Treaty metadata layer (if expanded globally) with careful legal disclaimers.

---

## 7) Schema-first vs Seed-data-first Recommendations

## Schema-first (must be in DB schema early)
- All identity-bearing operational entities (`TaxableEvent`, `TaxReturn`, `TaxPeriod`, `WithholdingEvent`, etc.).
- Versioning/provenance primitives (`TaxKnowledgeVersion`, effective date fields, source refs).
- Core framework dictionaries (`TaxType`, `TaxForm`, `Jurisdiction`) with stable IDs.
- Audit/log tables and trace fields (`source_trace_json`, decision engine/version refs).

Reason: these shape application logic and cannot be retrofitted safely once data volume grows.

## Seed-data-first (maintained as content packs)
- Country-specific forms and fields.
- Jurisdiction rates/thresholds/deadline rules.
- Classification mapping codes (service/product to tax class).
- Presumptive/withholding/legal applicability rules.

Reason: these are high-change legal content and must be updateable without migrations.

## Hybrid
- `TaxFormField` structure = schema-stable, but rows are seeded per country/version.
- Rule expressions stored as JSON DSL with validator in code.

---

## 8) Legal/Data Correctness Boundaries (explicit)

1. **Framework vs legal truth:** schema enables capability; legal correctness depends on maintained, reviewed country-pack content.
2. **Verification states mandatory:** every jurisdiction rule/rate/form mapping should carry verification level and source document link.
3. **No implicit certainty:** when rules are missing/expired/unverified, readiness engine must raise blockers instead of guessing.
4. **Time-bound logic:** every substantive rule must have effective dates and supersession linkage.
5. **Auditability by design:** final tax values should be explainable back to source transactions, rules, versions, and overrides.

---

## 9) Why each major layer is necessary (concise)

- **L0 Governance:** avoids black-box tax decisions and supports audits/regulatory scrutiny.
- **L1 Global model:** prevents country-specific schema sprawl and allows reusable engine logic.
- **L2 Country packs:** isolates legal variability into versioned content, not hardcoded behavior.
- **L3 Workspace profile:** determines obligations and eligibility correctly per business context.
- **L4 Operational facts:** preserves immutable evidence for returns and dispute defense.
- **L5 Compliance/returns:** converts data into actionable filing workflows and measurable readiness.
- **L6 Advanced tax domains:** handles withholding, foreign credit, and presumptive comparisons needed for real SMB tax workflows.
- **L7 Import/docs:** enables practical onboarding, reconciliation, and evidence-backed filings at scale.

