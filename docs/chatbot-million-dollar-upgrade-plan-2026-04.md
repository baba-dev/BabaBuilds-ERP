# AI Chatbot Upgrade Plan (Single-PR Blueprint)

_Date: April 18, 2026_

## 1) Current architecture and capabilities (what exists today)

### Surface area
- **Widget/UI:** `components/AIChatbot.tsx`
  - Floating chatbot panel with open/close, expand/minimize, clear history, retry button, quick prompts, markdown rendering, and theme-aware styling.
  - Uses workspace-scoped localStorage key (`cfo_chat_history_<workspaceId>`) for chat persistence.
- **Client trigger store:** `src/stores/ui/aiChatStore.ts`
  - Global event-style store to open chat with optional payload and auto-submit behavior.
- **Backend orchestration endpoint:** `app/api/chat/route.ts`
  - Auth-gated API route using NextAuth workspace session.
  - Uses Groq chat completions + function/tool calling.
  - Executes many ERP actions (invoicing, CRM, expenses, retainers, tax, inventory, navigation, theme switching).

### Working capabilities today
1. **Conversational assistance:** Standard message/reply flow with history replay (last 10) and markdown output.
2. **UI actions:** Bot can navigate users (`ui_navigate`) and switch theme (`set_ui_theme`).
3. **Operational tools:** Includes read + write actions over invoices, clients, expenses, proposals, retainers, investments, and stockout prediction.
4. **Error handling:** Friendly UX errors for missing/invalid/rate-limited Groq key and network failures.
5. **Cross-page AI launch:** Dashboard prompt bar can launch chat with auto-submit query.

---

## 2) Findings from deep analysis (bugs + product gaps)

## A. Functional bugs / integration mismatches

1. **Invoice autofill payload mismatch (high confidence bug).**
   - `draft_invoice` sends payload keys `{ clientName, totalAmount, serviceDescription }`.
   - Invoice form autofill logic expects `{ client, amount }`.
   - Result: AI "draft invoice" can navigate but often fails to prefill correctly.

2. **Action collision when model emits multiple tool calls in one turn.**
   - Tool loop stores only one `actionPayload` (last action wins).
   - If model emits multiple UI actions, earlier actions are silently discarded.

3. **Unvalidated client-provided history schema.**
   - Route trusts `history` from client and only slices to last 10.
   - No strict validation of roles/content length/allowed fields.
   - Prompt-injection and malformed history risk is higher than necessary.

4. **Help link uses raw `<a>` in Next.js page context.**
   - Lint flags this (`@next/next/no-html-link-for-pages`) in chatbot component.

## B. Reliability / safety gaps for “million-dollar app” standard

5. **No explicit confirmation gate for destructive actions.**
   - Bot can directly mutate business records (`mark_invoice_paid`, `create_client`, `auto_reconcile`, etc.) without user-confirm step in UX.

6. **No idempotency guarantees on write actions from AI path.**
   - Repeated prompts/retries can produce duplicate writes (e.g., client/task/retainer creation).

7. **No durable conversation and tool-action audit trail for compliance.**
   - Critical events are not logged as a first-class “AI action ledger” with actor, before/after state, and tool args snapshot.

8. **Single-model fallback strategy is weak.**
   - Hardcoded primary model and no quality/latency fallback chain.

9. **No streaming response path.**
   - UX waits for full completion; no token streaming, partial rendering, or early tool-progress updates.

10. **No policy layer for role-aware tool permissions.**
   - Workspace scoping exists, but tool-level RBAC for AI actions is not enforced centrally.

## C. Developer experience and maintainability gaps

11. **Monolithic endpoint.**
   - `app/api/chat/route.ts` combines prompt design, tool schemas, handlers, and orchestration in one large file.

12. **Type quality debt around `any`.**
   - Chat path has many `any` usages and lint errors, increasing regression risk.

---

## 3) One-PR upgrade strategy (single PR, but structured by internal phases)

> Goal: Deliver a **single PR** that upgrades architecture, trust/safety, reliability, and UX foundation without introducing a multi-PR dependency chain.

## Phase 1 — Contract hardening + safety rails

1. Introduce strict runtime validation for incoming chat payload:
   - `message` length caps
   - `history` role whitelist (`user`/`assistant` only)
   - max history item length
   - strip unsupported fields
2. Add centralized **tool policy engine**:
   - map tool → required permission(s)
   - deny tool execution when session role lacks permission
3. Add **confirmation-required flow** for high-risk mutating tools:
   - return `action: { type: "CONFIRM_REQUIRED", ... }`
   - UI shows approval sheet before execution

## Phase 2 — Orchestration redesign inside same PR

1. Split monolith into modules:
   - `lib/ai/orchestrator.ts`
   - `lib/ai/tool-registry.ts`
   - `lib/ai/tool-policy.ts`
   - `lib/ai/prompt-builder.ts`
2. Normalize tool definitions with typed schemas + typed handlers.
3. Support deterministic action handling:
   - either one explicit UI action contract or an ordered action queue.

## Phase 3 — Reliability and financial-grade controls

1. Add idempotency keys for write tools (`create_*`, `mark_*`, `auto_reconcile`, etc.).
2. Add structured AI action audit logging:
   - who, workspace, tool, args hash, result, timestamp, latency, status.
3. Add model fallback strategy + timeout budget:
   - primary model, backup model, and clear user-facing degradation message.

## Phase 4 — UX uplift for premium assistant feel

1. Add streaming response UI.
2. Add explicit “tool is running” timeline in chat.
3. Add “undo/rollback where possible” CTA after mutating actions.
4. Fix invoice payload mismatch and normalize payload contracts across pages.
5. Replace raw help anchor with Next `Link`.

## Phase 5 — Quality gates and launch readiness

1. Add unit tests for:
   - payload validation
   - tool permission gating
   - action queue behavior
2. Add integration tests for high-value flows:
   - draft invoice with prefill
   - pay invoice confirmation
   - create client idempotency
3. Add observability dashboard metrics:
   - tool success rate
   - tool error rate by type
   - latency p95
   - user confirmation approval/denial ratio

---

## 4) Prioritized execution backlog (inside the same PR)

### P0 (must ship in this PR)
- Fix invoice payload contract mismatch.
- Add history/message validation.
- Add confirmation flow for destructive tools.
- Add idempotency guard for financial mutations.
- Add AI action audit log records.

### P1 (should ship in this PR)
- Modularize orchestration and tool registry.
- Add typed tool handler contracts.
- Resolve chatbot lint issues in touched files.
- Add streaming delivery for assistant responses.

### P2 (stretch in same PR if time permits)
- Model fallback chain.
- Suggested prompts based on current route/entity context.
- Tool explainability panel ("why I ran this tool").

---

## 5) Definition of done for this “million-dollar integration” PR

The single PR is complete only when all of the following are true:

1. **Safety:** Mutating tool calls require explicit user confirmation for designated actions.
2. **Reliability:** Duplicate-submission paths are idempotent for key financial write tools.
3. **Auditability:** Every tool call is traceable with structured logs.
4. **Correctness:** Invoice draft flow autofills consistently end-to-end.
5. **Architecture:** Chat orchestration is modular, typed, and test-covered.
6. **UX quality:** Streaming responses + visible tool progress are present.

---

## 6) Suggested branch implementation order (single PR)

1. Build typed contracts + validator + policy layer.
2. Refactor route into orchestrator + tool registry modules.
3. Wire confirm-required action path in API + chatbot UI.
4. Add idempotency + audit events for write tools.
5. Fix payload contract mismatches and navigation polish.
6. Add tests + metrics instrumentation + docs update.

This order keeps risk controlled while still delivering one cohesive upgrade PR.
