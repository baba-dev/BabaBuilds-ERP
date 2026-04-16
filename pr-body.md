# feat: Production-Grade RBAC + Seat Management System

## Summary

Replaces the minimal two-value role system (`OWNER` / `MEMBER`) with a full
ERP-native Role-Based Access Control framework. Every change is backward-compatible
with existing sessions and data; the new `businessRole` field defaults to `OWNER`
for all existing workspace users so nothing breaks on deploy.

---

## What Changed

### Phase 1 — Core Permission Library (`lib/permissions.ts`)

Complete rewrite. Now the single source of truth for all access control.

| Element | Detail |
|---|---|
| **9 Business Roles** | `OWNER`, `ADMIN`, `FINANCE_MANAGER`, `ACCOUNTANT`, `SALES_MANAGER`, `OPERATIONS_MANAGER`, `INVENTORY_MANAGER`, `STAFF`, `VIEWER` |
| **43 Permission Keys** | `module.action` format across 15 modules (invoices, expenses, proposals, accounting, tax, billing, workspace…) |
| **Conservative templates** | Sensitive permissions (`accounting.post`, `tax.manage`, `billing.manage`, `reports.export`) assigned only to OWNER/ADMIN |
| **Seat semantics** | Explicit constants: pending invites reserve seats, deactivated users free seats, owners count toward seats |
| **Ownership rules** | Typed constants: only OWNER can assign OWNER/ADMIN/FINANCE_MANAGER/ACCOUNTANT; ADMIN can assign lower roles |
| **`canAssignRole()`** | Type-safe role-assignment guard for both API and UI |
| **`ROLE_BADGE_COLORS`** | Tailwind token map for UI role badges |
| **Legacy shims** | `canInviteMembers()`, `canManageBilling()`, `PERMISSIONS` kept deprecated but functional |

### Phase 2 — Prisma Schema (`prisma/schema.prisma`)

```prisma
// New enum — authoritative at ORM level
enum BusinessRoleEnum {
  OWNER ADMIN FINANCE_MANAGER ACCOUNTANT
  SALES_MANAGER OPERATIONS_MANAGER INVENTORY_MANAGER STAFF VIEWER
}

model WorkspaceUser {
  businessRole BusinessRoleEnum? @default(OWNER)  // NEW — nullable for migration safety
  isActive     Boolean  @default(true)              // NEW — deactivated users free seats
  joinedAt     DateTime @default(now())             // NEW — audit trail
  lastActiveAt DateTime?                            // NEW — last-seen timestamp
  ...
}

model WorkspaceInvite {
  businessRole BusinessRoleEnum @default(STAFF)     // NEW — role the invite grants
  ...
}

model Workspace {
  seatAddonCount Int @default(0)                    // NEW — future purchased seats
  ...
}

model RbacAuditLog { ... }   // NEW — RBAC-specific structured event table
```

Applied via `npx prisma db push` (migration history is broken; see AGENTS.md).

### Phase 3 — Server-Only Enforcement Library (`lib/rbac.ts`)

New file. Authoritative gate for all server-side permission checks.

- **`requirePermission(userId, workspaceId, permission)`** — throws `RbacDeniedError` if denied; always does a fresh DB lookup, never trusts the JWT
- **`withPermission()`** — convenience wrapper that returns structured `{ granted, response }` for route handlers
- **`checkSeatAvailability(workspaceId)`** — returns full seat breakdown including pending invites, plan tier, warning thresholds
- **`hasOtherActiveOwner(workspaceId, excludeUserId)`** — prevents removing the last owner
- **`getGrantedPermissions(userId, workspaceId)`** — full permission map for UI conditional rendering
- **`logRbacEvent(event)`** — single write path that atomically writes to both `RbacAuditLog` and `AppActivityLog`
- **`RbacDeniedError`** / **`rbacDeniedResponse()`** — structured 403 responses

### Phase 3 — API Routes Updated/Created

| Route | Change |
|---|---|
| `POST /api/team/invite` | Rewrote — uses `BusinessRoleEnum`, `checkSeatAvailability`, `canAssignRole`, dual audit write |
| `POST /api/team/remove` | Rewrote — supports `action: "deactivate"` (soft) vs `"remove"` (hard), last-owner safeguard, self-action block |
| `PATCH /api/team/role` | **New** — role change with self-demotion block, last-owner guard, high-privilege alert |
| `GET /api/team/access-log` | **New** — paginated `RbacAuditLog` with eventType filter and role label enrichment |
| `GET /api/team/seats` | **New** — seat availability data for the Seats/Plan tab |
| `GET /api/team/members` | Updated — returns `businessRole`, `isActive`, `joinedAt`, `grantedPermissions` |
| `POST /api/expenses` | +`expenses.create` guard |
| `PATCH /api/expenses/[id]` | +`expenses.create` guard |
| `DELETE /api/expenses/[id]` | +`expenses.delete` guard |
| `GET/DELETE /api/invoices` | +`invoices.view` / `invoices.delete` guards |
| `GET/DELETE /api/invoices/[id]` | +`invoices.view` / `invoices.delete` guards |
| `POST /api/proposals` | +`proposals.create` guard |
| `POST /api/settings` | +`workspace.manage_settings` guard |

### Phase 4 — RBAC UI Components

**`components/rbac/permission-gate.tsx`**
- `<PermissionGate permission="…" grantedPermissions={…}>` client component for conditional UI rendering

**`components/rbac/access-denied.tsx`**
- Full-page and compact inline `<AccessDenied>` component with role badge, required-permission display, and admin CTA

### Phase 4 — Team & Access Page (`settings/team/page.tsx`)

Complete rebuild as a premium 5-tab interface:

| Tab | Content |
|---|---|
| **Members** | Member list with search/filter, inline role editor (Select), deactivate vs remove, pending invites with cancel |
| **Roles & Permissions** | Scrollable permission matrix with `✓`/`✗` for all 43 permissions × 9 roles; high-risk permissions highlighted |
| **Seats / Plan** | Visual seat meter (colour-coded at 80% / 100%), breakdown (active + pending + available), plan badge |
| **Access Activity** | Paginated `RbacAuditLog` timeline with event icons and role-change diff |
| **Governance** | SoD conflict awareness cards + Maker-Checker workflow definitions (informational, Phase 1) |

All ownership rules are enforced in the UI: actors see only roles they can assign, self-role edits are blocked, owner actions require another owner to exist.

### Phase 5 — Settings Page (`settings/page.tsx`)

- Replaced the old inline team section (~220 lines, invite modal + member list) with a compact link card pointing to `/settings/team`
- Removed all now-dead state: `teamLoading`, `teamError`, `teamMembers`, `teamInvites`, `fetchTeam`, `cancelInvite`, `owner`, `handleInvite`
- `isTeamPlan` constant retained for other settings gating

### Phase 6 — NextAuth Session (`lib/auth.ts`)

- Added `businessRole: string` to the `Session` type declaration
- JWT callback now selects `businessRole` from `WorkspaceUser` in both the main path and the auto-provision path
- Session callback propagates `token.businessRole` → `session.businessRole`
- Invite-acceptance transaction upgraded to `upsert` (sets `businessRole` from invite, re-activates previously-deactivated accounts)
- **Invariant preserved**: `businessRole` in JWT is UI-hint only; server enforcement always uses `requirePermission()` with a fresh DB lookup

### Phase 3 (security) — `lib/security/access-risk.ts`

- `HIGH_RISK_ROLES` set now includes `FINANCE_MANAGER` (sourced from `HIGH_RISK_BUSINESS_ROLES`)
- `alertElevatedPrivilegeGrant()` called from invite and role-change routes on high-risk assignments

---

## Ownership / Safety Invariants

All of these are enforced at the **API layer** (not just UI):

1. ✅ A workspace must always have at least one active OWNER (`hasOtherActiveOwner`)
2. ✅ You cannot change your own role (self-demotion blocked)
3. ✅ Only OWNER can promote to OWNER, ADMIN, FINANCE_MANAGER, ACCOUNTANT
4. ✅ ADMIN cannot act on peers (other ADMINs, FINANCE_MANAGERs, ACCOUNTANTs)
5. ✅ Deactivated members retain audit trail but cannot access the workspace
6. ✅ Pending invites reserve seats to prevent over-inviting

## Seat Semantics

| Scenario | Counts toward seat? |
|---|---|
| Active member (any role) | ✅ Yes |
| Owner | ✅ Yes |
| Pending invite (non-expired) | ✅ Yes (reserved) |
| Deactivated member (`isActive=false`) | ❌ No |
| Expired invite | ❌ No |

Plan limits: `FREE=1`, `PRO=3`, `TEAM=15`, `ENTERPRISE=Unlimited`, `TRIALING=5`

## Audit Trail

Every RBAC event writes atomically to **two tables** via `logRbacEvent()`:

- `RbacAuditLog` — structured, filterable, powers the Access Activity UI tab
- `AppActivityLog` — unified compliance trail for all app events

Event types: `invite_sent`, `invite_accepted`, `invite_cancelled`, `role_changed`, `member_removed`, `member_deactivated`, `member_reactivated`, `seat_limit_hit`, `rbac_access_denied`, `owner_safeguard_blocked`

---

## Backward Compatibility

- All existing `WorkspaceUser` rows get `businessRole = OWNER` (Prisma default). No data loss.
- The old `role` string field is preserved on `WorkspaceUser` and `WorkspaceInvite` for session compatibility
- `session.role` still exists; `session.businessRole` is additive
- All deprecated permission helpers (`canInviteMembers`, `PERMISSIONS`, `getMaxUsersForPlan`) are still exported with `@deprecated` annotations

## Testing Notes

- TypeScript: `npx tsc --noEmit` — **0 new errors** (pre-existing count unchanged)
- Schema: `npx prisma db push` — applied cleanly
- `lib/rbac.ts` is marked `import 'server-only'` — will fail fast if accidentally imported in a Client Component

---

## Future Work (not in scope)

- [ ] Live SoD conflict enforcement (block actions that would violate SoD rules)
- [ ] Maker-Checker workflow execution engine
- [ ] `seatAddonCount` purchasing flow (field added, UI not yet wired)
- [ ] `lastActiveAt` update hook in auth callbacks
- [ ] Access certification tasks (periodic role review reminders)
