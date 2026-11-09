# Optional modules

## Model
- `WorkspaceModule` (workspace, key, `isEnabled`, `configJson`). Keys live in `lib/module-keys.ts`; everything else about a module (group, icon, link, suggested partners, default) lives in `lib/module-registry.ts`. The menu, dashboard cards, Settings > Modules and the "module is off" page read from it.
- `lib/modules.ts` decides availability: `plan_required` (all modules except SHOP need a paid plan), `disabled`, `enabled`. `getModuleStates()` adds `paused` (switched on, but the plan ended; data and switch are kept).
- Turning a module off hides it; data stays. Toggles are written to the settings change history.

## Guarding rules
1. Every API route of a module must check the module (`requireModule`, `isModuleEnabled`, or the module's shared helper). `tests/modules/route-coverage.test.ts` fails when a route is added without one. Allowed exceptions are listed in that test with a reason.
2. The workspace always comes from the session (`resolveSessionMembership` in `lib/workspace-scope.ts`), never from "the user's first membership". The same test fails on the old pattern.
3. Background jobs must skip workspaces where the module is off (`documents-ocr`, `cash-forecast`, `ar-reminders` do).

## Module options
`lib/module-config.ts` lists the options that can be set from Settings. Today: AR Collections `autoReminders` (off by default). Other keys in `configJson` (for example the reminder cooldown) are preserved.

## Cron
`GET /api/cron/ar-reminders` (Bearer `CRON_SECRET`) sends overdue reminders for workspaces with AR Collections on and `autoReminders` enabled. Schedule it daily next to the other cron routes, for example 07:00.
