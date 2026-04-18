## Demo account access for dev UI/UX checks

This project has a demo provisioning endpoint at `POST /api/auth/demo` that creates a seeded demo workspace and returns short-lived credentials for the built-in NextAuth credentials provider (`demo-login`).

### Goals

- **Development automation**: allow UI/UX checks (including AI agents / browser automation) to consistently create and sign into a demo workspace in *development*.
- **Keep security**: do not weaken production security; keep abuse controls for demo provisioning.

### Production behavior (unchanged)

- **Turnstile required**: production requests must include a valid Turnstile token in the request body as `{ "token": "<turnstile-token>" }`.
- **Circuit breaker**: demo provisioning is rate-limited by a global “recent demo workspaces” circuit breaker.

### Development behavior (updated)

In `NODE_ENV=development`, the endpoint is additionally guarded so it stays safe even if you accidentally expose a dev server:

- **Localhost-only**: the request must be addressed to `localhost`/`127.0.0.1` (based on `Host` / `X-Forwarded-Host`).
- **Explicit gate**: requests must provide either:
  - **Turnstile token** (same as production), or
  - **Agent key header**: `x-demo-agent-key: <value>` where `<value>` matches `DEMO_AGENT_KEY` in your environment.

If a valid `x-demo-agent-key` is provided, **non-local callers (e.g. cloud agents)** are allowed in development.

### Recommended setup for automation / AI agents (development)

1. Set an agent key in your dev `.env.local` (or your terminal environment):
  - `DEMO_AGENT_KEY=some-long-random-string`
2. Your automation can provision a demo user by calling:
  - `POST /api/auth/demo`
  - Header: `x-demo-agent-key: some-long-random-string`
  - JSON body: `{}` (or `{ "token": null }`)
3. The response contains `{ email, password, templateKey }` (the password is a short-lived, single-use token stored in `VerificationToken`).
4. Complete sign-in using the existing UI flow (click “Try interactive demo”), or programmatically via NextAuth credentials provider (`demo-login`).

### Notes

- **Do not set `DEMO_AGENT_KEY` in production**. Production already requires Turnstile; this key is intended only for dev automation.
- **Do not treat localhost header checks as a WAF**. They are a safety net for typical dev usage, not a substitute for proper network controls.