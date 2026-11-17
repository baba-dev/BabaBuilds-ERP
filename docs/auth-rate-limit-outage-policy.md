# Authentication rate limits: atomic reservation and Redis-outage policy

Applies when `ERP_REDIS_RATE_LIMIT_ENABLED=true` (see `redis-rate-limits-phase2.md`). With Redis
disabled the same logic runs on a bounded per-process counter.

## Password sign-in reserves its attempt atomically

`lib/auth.ts` calls `reservePasswordAuthAttempt(key)` **before** verifying the password. It performs one
atomic `hit` in Redis (check and spend in the same Lua call), so N parallel guesses admit exactly five
per 15-minute window. The previous `checkPasswordAuthRateLimit` (peek) followed by
`recordPasswordAuthFailure` was check-then-act: a burst all passed the peek while the slow hash ran,
and only then recorded failures.

Rules for callers of `reservePasswordAuthAttempt`:

- Do **not** also call `recordPasswordAuthFailure` for the same attempt (it is already counted).
- Call `clearPasswordAuthRateLimit(key)` on success so legitimate sign-ins never consume quota.

`checkPasswordAuthRateLimit` / `recordPasswordAuthFailure` are unchanged and still used by the passkey
and password-reset endpoints, which do not guess secrets and keep their existing semantics.

## Redis outage policy

`ERP_AUTH_RATE_LIMIT_OUTAGE_POLICY`

| Value | Behaviour when Redis auth counters are unreachable |
| --- | --- |
| unset / `fail-closed` (default) | Deny every attempt with a generic 30 s retry. Brute-force safe; **all users, including administrators, cannot sign in** until Redis recovers (plus the limiter's 5 s circuit-breaker cooldown). |
| `local` | Break-glass. Keep enforcing the same 5 attempts / 15 min with the per-process counter so sign-in keeps working. Counters are not shared across ERP processes, so the cap is per process. |

Unrecognised values fail closed. Set `local` only for the duration of a Redis incident, then unset it and
restart.

## Known follow-up (Redis owners)

`lib/redis/rate-limit.ts` opens its 5 s circuit breaker on *any* error, including a single transient
timeout, and `fail-closed` then denies all sign-ins for that period. Consider opening it only after
consecutive failures. This was deliberately left alone to avoid colliding with in-flight Redis work.
