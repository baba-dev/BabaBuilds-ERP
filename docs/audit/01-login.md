# Audit 01 — `/login`

Files: `app/login/page.tsx`, `components/AuthModal.tsx` (976 lines), `components/auth/AuthAmbientBackground.tsx`,
`lib/auth.ts`, `lib/auth/password.ts`, `app/api/auth/magic-link-policy/route.ts`, `app/layout.tsx`, `proxy.ts`.

Live measurements (prod, from this container): HTML 44.8 KB decoded, 25 JS + 2 CSS files, ~362 KB compressed;
`/api/auth/session|csrf|providers` TTFB ≈ 0.4–0.46 s each; `/login` TTFB 0.18–0.38 s.

## Flaws

### Performance (ordered by impact)
| # | Flaw | Where |
|---|------|-------|
| P1 | Form is invisible until the session fetch finishes: `if (status === "loading" \|\| "authenticated") return null`. The server already knows the user is signed out, so this adds hydrate + one ~0.4 s round-trip of blank card. After a successful login the form also vanishes (blank page) until the browser navigates. | AuthModal.tsx:212 |
| P2 | Password hash is `bcryptjs` (pure JS) at cost 12. It blocks the Node event loop for several hundred ms per attempt, and every other request on the VPS stalls with it. | lib/auth/password.ts |
| P3 | Post-login chain is serial and heavy: `signIn` callback (2 sequential queries) -> `jwt` callback (deep nested `user` query, then a second deep `companyGroupMember` query, both repeating the same workspace select) -> 2 `user.update`s -> full page reload to `/dashboard` which re-runs session, gatekeeper and its own data. | lib/auth.ts:573-870, AuthModal.tsx:427 |
| P4 | `window.location.href = result.url` forces a full document reload (re-downloads/re-hydrates the whole app, SW boot) instead of `router.replace`. | AuthModal.tsx:369,427 |
| P5 | Root layout ships ALL i18n namespaces (36) to the client on every page, plus `SessionProvider`, `SetupGatekeeper`, `PWARegistration`, `OfflineSyncBanner`, JSON-LD and both fonts (Inter + Noto Naskh Arabic, 4 weights) on the login page. | app/layout.tsx |
| P6 | Background cost: 4 orbs + emanation layer, each `filter: blur(40-52px)`, animated for 38-48 s forever, plus two more blurred 800/400 px blobs in the layout, plus `backdrop-blur-xl` on the card. Heavy on GPU/battery, janky on mid/low phones. | globals.css:270-360, layout.tsx |
| P7 | `AuthModal` bundles Turnstile, SimpleWebAuthn, Dialog and the whole demo picker eagerly although the demo dialog is closed and passkey is only used on click. | AuthModal.tsx:21-36 |
| P8 | `page.tsx` awaits session, searchParams and cookie preview sequentially; no `Promise.all`. | page.tsx:41-51 |
| P9 | `proxy.ts` runs on `/login` and, when a CrowdSec key is set, blocks the first request per IP up to 200 ms; per-process cache means every instance/restart repeats it. | proxy.ts |
| P10 | `magic-link-policy` runs on every email blur: 3 sequential DB queries, no cache, no debounce. | route.ts |

### Security / correctness
| # | Flaw |
|---|------|
| S1 | `/api/auth/magic-link-policy` is unauthenticated and unthrottled and returns different answers for admin/owner emails -> account/role enumeration (confirmed: returns 200 for arbitrary emails on prod). |
| S2 | Timing enumeration: unknown user returns before any bcrypt compare, known user pays ~hundreds of ms. Add a dummy hash compare. |
| S3 | Rate-limit key uses first `x-forwarded-for` entry (client-controlled unless the proxy strips it) and is in-memory (reset on restart, per instance). |
| S4 | 5 failures from anyone locks the real user out for 15 min (lockout-DoS); lock is per account, not per account+IP. |
| S5 | Turnstile site key hard-coded; magic-link Turnstile is requested (`requiresTurnstile`) but the widget is only rendered inside the closed demo dialog, so a rate-limited user can never complete it. |
| S6 | Password/reset/forgot handlers have no try/catch: a network error leaves the button spinning forever (`isPasswordLoading` never reset in forgot/reset; signIn throw skips the reset in login). `handleDemoSignIn` calls `response.json()` unguarded. |
| S7 | Only 3 `?error=` codes are surfaced. `Verification` (expired magic link), `OAuthAccountNotLinked`, `CredentialsSignin`, `AccessDenied` show nothing. |
| S8 | Reset token is a visible free-text field; mode flips from the URL but the token stays in the address bar/history (should be stripped with `history.replaceState`). |

### UI / UX / a11y
| # | Flaw |
|---|------|
| U1 | Wall of options: passkey, Google, password form, magic-link form, demo, all stacked in one 90vh scrolling card. Two email inputs (shared state) on one screen. No clear primary path. |
| U2 | Two stacked logos/brands: page header logo and the card's own icon + "BabaBuilds ERP" title. |
| U3 | Layout shift: passkey section pops in after hydration; sections reorder after reading `localStorage` (CSS `order`), so the UI visibly jumps. |
| U4 | `order:` reorders visually but not in DOM -> tab order and screen-reader order disagree with what's shown (WCAG 2.4.3). |
| U5 | Copy promises "passkeys can be suggested automatically" but conditional UI is never started (`startAuthentication(..., useBrowserAutofill)` / `autocomplete="username webauthn"` missing). |
| U6 | Inputs lack `autoComplete` (`username`/`current-password`/`new-password`), `name`, `inputMode`, and a show/hide password toggle -> password managers and mobile keyboards misbehave. |
| U7 | Mixed i18n: many strings hard-coded English (`Sign in with password`, `Forgot password?`, `Continue with passkey`, all status messages, footer links) next to translated ones. |
| U8 | RTL broken: icons use `left-3` / `pl-10` instead of `start-3` / `ps-10` although the app ships Arabic. |
| U9 | Contrast: `text-amber-300/90` on a light amber panel; 11px helper text; demo button styled like a disabled ghost. |
| U10 | Turnstile forced to `theme: "dark"` on a light card. |
| U11 | No sign-up/trial link, no language or theme switcher, no "show what's new". Trial users arriving from marketing see the same screen as returning users apart from a small banner. |
| U12 | Google button isn't disabled while a passkey is loading; loading states are per-button instead of one form-level state. |

## Enhancements

### Quick wins (≈1 day, biggest user-visible gain)
1. **Render the form immediately.** Drop the `status === "loading"` early return (server already redirects signed-in users). Show the "Redirecting…" state instead of `null` after success. Expected: removes ~0.4-0.5 s blank card.
2. **Swap `bcryptjs` -> native `bcrypt`/`argon2`**, add rehash-on-login, add a dummy compare for unknown users. Cuts login CPU and closes S2.
3. **Use `router.replace(result.url)`** and `prefetch("/dashboard")` once the email is typed.
4. **Static or paused background:** one gradient + static blur image (or `will-change` free), animate only when `prefers-reduced-motion: no-preference` and on `lg:` screens; remove the layout's duplicate blobs on `/login`.
5. **Make the sandbox/Turnstile parts lazy:** `next/dynamic` for the demo dialog, Turnstile and `@simplewebauthn/browser`.
6. **Surface all `?error=` codes** via a lookup table.
7. **try/catch/finally around every handler**; add `autoComplete` attrs and show-password toggle.

### UI redesign (proposal)
- Two-step "identifier first" flow: email -> then show the best method for that account (passkey if registered, password if set, else magic link). One email field, one primary button, "Other ways to sign in" disclosure (Google, magic link, demo). Removes the wall of options and the duplicate email.
- Split-screen on desktop: left = value prop/trial banner, right = form; mobile = form only. Single logo.
- Conditional-UI passkeys (autofill) on the email field, so passkey users never press a button.
- Use design-system tokens (not hard-coded `orange-*`), logical CSS properties for RTL, and move all strings to `AuthModal` messages.

### API enhancements
- **Merge `magic-link-policy` into the sign-in step** (server decides; client never calls a separate oracle) or make it constant-shape, throttled and cached 60 s.
- **One auth-options endpoint** (`POST /api/auth/identify {email}` -> `{methods:["passkey","password"]}`) with uniform timing/shape, replacing blur-time policy checks and enabling the identifier-first flow.
- **jwt callback:** one query for memberships (reuse the select fragment), `Promise.all` with group memberships, and skip group query when the user has no `companyGroupMember` rows (cache `hasGroups` in the token). Move audit writes (`recordPasswordAuthAuditEvent`, `logActivity`) off the request path.
- **Rate limiting** in the DB or Redis (not process memory), keyed on trusted client IP from `getClientIp`; lock per (account, IP) with progressive delay instead of hard 15-min account lock.
- Send only `AuthModal`, `Common` namespaces on `/login` (`NextIntlClientProvider` with a pick of messages).

### Suggested measurements to confirm (not yet done)
- Lighthouse mobile on `/login` (LCP/TBT/CLS) before/after.
- Server timing around `authorize` (bcrypt) and the jwt callback on prod.
- `EXPLAIN` on the jwt queries once the DB is Postgres/SQLite size known.
