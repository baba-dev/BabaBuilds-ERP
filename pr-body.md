## Description
This PR encapsulates Phases 1-4 of the **Commercial Workflow Engine**, completing the end-to-end "Proposal-to-Paid" lifecycle and embedding it deeply within the BabaBuilds ERP ecosystem.

### Key Deliverables
- **Foundation Architecture:** Erected `BillingMilestone` and linked explicit downstreams (`ProposalConversion`) resolving loose data models without muddying accounting tables.
- **Pipeline Operations Center:** Built `app/(dashboard)/proposals/pipeline/page.tsx` offering executive tracking across dynamic pipeline stages (`Draft` -> `Sent` -> `Viewed` -> `Accepted` -> `Converted` -> `Paid`).
- **Traceability Upgrades:** Linked downstream artifacts (Invoices, Retainers, Service Orders) directly back to upstream Proposals via distinct `Origin` UI badges.
- **Actionable Collections:** Formulated safe "Next Best Action" logic allowing users to chase unpaid converted proposals natively into accounts receivable workflows.
- **Automated Workflow Orchestrator:** Implemented `lib/commercial-workflow/tasks.ts` to cautiously instantiate non-spammy operational tasks (e.g., Conversion prompts, Reminders).
- **Cash Forecasting Safety:** Blocked untested Pipeline volume ("Viewed") from infiltrating hard Presumptive Income logic bounds.

### Verification Passes
- [x] Traceability functions accurately via Source Badges across ledgers.
- [x] "Stalled" multi-milestone logic does not crash if partial payments exist.
- [x] Tested Actionable Linkages successfully bridging `/proposals/pipeline` with `/income`.

Thank you for reviewing!
