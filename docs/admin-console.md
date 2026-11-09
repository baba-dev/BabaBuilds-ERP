# Platform admin console (`/admin`)

The console is for the platform owner, not for workspace admins. Workspace settings live in `/settings`.

## Getting access
Access needs **both**:
1. The user's role is `ADMIN` in the database: `npm run admin:promote -- you@example.com` (the account must exist; sign in once first).
2. The user's email is in the server setting `SUPERADMIN_EMAILS` (comma separated). There is no default. Restart the app after changing it.

The page layout and every `/api/admin/*` route use the same rule (`lib/admin/access.ts`). Someone with only one half sees a setup notice that says which half is missing; anyone else gets a 404. (Before, the layout accepted one hard-coded email while the APIs wanted the role and the allowlist, so the page could open and every call fail.)

## Sections
- **Overview**: revenue, plans, signups, and a list of what needs attention (trials ending, expired paid plans, stale backups, configuration gaps).
- **Accounts**: every workspace with search, filters and paging; a detail drawer with members and usage; plan actions (set plan, extend, grant trial, suspend, reactivate) that require a reason and are written to the activity log.
- **Security**: configuration checklist (names only, never values), sign-in failures, rate-limit hits, access-control report.
- **Operations**: backups (database snapshot plus uploaded files) and maintenance actions with typed confirmation.
- **Activity log**: filter and page the platform audit log; prune only old entries.

## Notes
- Plan actions set status, tier **and the end date**. Paid access is time-bound, so a plan without an end date grants nothing.
- The console is English only.
