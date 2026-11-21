# Publishing BabaBuilds ERP to Google Play (A–Z)

BabaBuilds ERP ships to Android as a **Trusted Web Activity (TWA)**: a thin Android shell
that opens `https://erp.bababuilds.com` full-screen, using the existing PWA (manifest, service
worker, push) and Digital Asset Links (`public/.well-known/assetlinks.json`). There is no second
codebase: every web deploy updates the Android app instantly; the Play listing only needs a new
AAB when the shell itself changes (icon, package settings, target SDK).

> Why TWA and not Capacitor/React Native? The app is a server-rendered Next.js app with NextAuth
> cookies, server components and Prisma on the server. A TWA keeps one code path, one auth flow
> and one release train. Capacitor would only be needed for native APIs the web cannot reach
> (not required today).

## 1. What is already done in this repo

| Area | State |
|---|---|
| Web app manifest | `app/manifest.ts`: standalone, `start_url=/dashboard`, any + **maskable** + **monochrome** icons, shortcuts, share target |
| Icons | `public/icons/maskable-{192,512}x*.png` (full-bleed, glyph inside the 80% safe zone), `monochrome-512x512.png` (Android 13 themed icon) |
| Service worker | `app/sw.ts` (Serwist): precache, offline fallback `/offline`, push, background sync |
| Digital Asset Links | `public/.well-known/assetlinks.json` (package `com.bababuilds.erp.twa`) — **needs the Play signing fingerprint, see §3.3** |
| TWA config | `android/twa-manifest.json` (Bubblewrap input) |
| Viewport | `viewport-fit=cover`, `interactive-widget=resizes-content`, light/dark `theme-color` (edge-to-edge on Android 15+) |
| Mobile UI | Bottom tab bar, mobile top bar with section title, safe-area handling, 44px touch targets, `dvh` heights, responsive page headers, POS cart bar — see §6 |
| Privacy policy | `/privacy` |
| Account deletion URL | `/delete-account` (required by Play) |
| Listing screenshots | `docs/play-store/screenshots/*.png` (720×1440, phone) |
| Play Billing | `app/api/billing/play/{verify,rtdn}`, `lib/billing/play-*.ts`, `components/billing/PlayUpgradeCard.tsx` (§3a) |
| Regression tests | `tests/mobile/`, `tests/billing/` |

## 2. Decisions / risks you must own (cannot be solved in code alone)

1. **Google Play Payments policy: solved in code, needs Console + credentials.** Inside the Android app,
   subscriptions are sold only through **Google Play Billing** (§3a); Razorpay/Stripe checkout, partner
   coupons and the payment-method vault are hidden when the app runs as the TWA. The website keeps
   Razorpay/Stripe. Confirm with Play's current *Payments* policy that your listing/category is happy with
   this split.
2. **Account deletion.** Play requires a way to request deletion in-app *and* a public web URL.
   `/delete-account` and `/privacy` cover the web URL with an email-based process
   (`admin@bababuilds.com`, 30-day SLA — confirm that SLA is one you can meet, or edit the page).
   An in-app "Delete my account" button in Settings is recommended before launch.
3. **Account type.** A new *personal* developer account must run a **closed test with at least 12
   testers for 14 consecutive days** before production access (verify the current numbers in Play
   Console). An *organisation* account avoids this but needs D-U-N-S verification.
4. **Target API level.** Play enforces a minimum target SDK that rises every August. Use the
   latest Bubblewrap (`npm i -g @bubblewrap/cli@latest`, `bubblewrap update`) and check Play
   Console's requirement the week you submit.

## 3. Build the Android App Bundle

### 3.1 Prerequisites
- JDK 17 and the Android SDK (`bubblewrap doctor` installs/validates both).
- `npm i -g @bubblewrap/cli`

### 3.2 Create the upload key (once) — **never commit it**
```bash
cd android
keytool -genkeypair -v -keystore android.keystore -alias bababuilds-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```
`android/*.keystore`, `*.jks`, `*.aab`, `*.apk` are git-ignored. Back the keystore and its passwords
up in your password manager; losing the upload key means a Play support ticket to reset it.

### 3.3 Build
```bash
cd android
bubblewrap build          # reads twa-manifest.json, produces app-release-bundle.aab
```
Bump `appVersionCode` (and `appVersionName`) in `twa-manifest.json` for every upload.

### 3.4 Digital Asset Links (this is what removes the browser URL bar)
1. Upload the AAB to an **Internal testing** track in Play Console (Play App Signing is on by default).
2. Play Console → *Setup → App signing* → copy the **App signing key certificate SHA-256**.
3. Add it (and keep your upload-key fingerprint for local APK testing) in
   `public/.well-known/assetlinks.json` under `sha256_cert_fingerprints`, then deploy the web app.
4. Verify: `https://erp.bababuilds.com/.well-known/assetlinks.json` returns `application/json`, and
   use Google's *Statement List Tester* (`digitalassetlinks.googleapis.com`) for the package.
5. If the app opens with a URL bar, the fingerprint or package name is wrong.

The test `tests/mobile/mobile-readiness.test.ts` fails if `twa-manifest.json` and
`assetlinks.json` disagree on the package name.

## 3a. Google Play Billing (in-app subscriptions)

**How it works.** The TWA exposes the Digital Goods API and the Payment Request method
`https://play.google.com/billing`. `components/billing/PlayUpgradeCard.tsx` lists the plans with Google's
localised prices and opens Google's purchase sheet. The returned purchase token goes to
`POST /api/billing/play/verify`, which re-reads it from Google (`purchases.subscriptionsv2`), binds it to
the caller's workspace (one token = one workspace, ever), grants the tier **until Google's expiry date**,
records a ledger row per charge and acknowledges the purchase. Renewals, cancellations, grace periods,
holds, refunds and expiry arrive via **real-time developer notifications** at
`POST /api/billing/play/rtdn`; each notification triggers a fresh read from Google, so a forged body
cannot grant access. Cancelling is only possible in Google Play (the web Cancel button is replaced by
*Manage in Google Play*).

**Play Console setup**
1. *Monetize → Products → Subscriptions*: create **one subscription per interval, each with one
   auto-renewing base plan**, with these exact product IDs (`lib/billing/play-products.ts`):
   `bababuilds_pro_monthly`, `bababuilds_pro_quarterly`, `bababuilds_pro_yearly`,
   `bababuilds_team_monthly`, `bababuilds_team_yearly`. Set prices per country there (Play charges the
   user; the website prices in `lib/pricing.ts` are not used). Enable a grace period (Play recommends 7 days) and account hold.
2. Create a **service account** (Google Cloud → IAM) and invite it in *Play Console → Users and permissions*
   with *View financial data* and *Manage orders and subscriptions*. Put its JSON key in
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (raw or base64). Enable the *Google Play Android Developer API* in that project.
3. Real-time notifications: *Monetize → Monetization setup*: create a Pub/Sub topic, grant
   `google-play-developer-notifications@system.gserviceaccount.com` the *Pub/Sub Publisher* role on it, create a
   **push** subscription to `https://erp.bababuilds.com/api/billing/play/rtdn?token=<GOOGLE_PLAY_RTDN_SECRET>`,
   set the topic in Console and use *Send test notification*.
4. `android/twa-manifest.json` has `features.playBilling.enabled = true`. Answer "yes" to the Play Billing
   prompts when running `bubblewrap init/update`, and re-run `bubblewrap build`.
5. Add **license testers** (*Settings → License testing*) and test on an internal-testing install: test
   purchases are accepted only in non-production or with `GOOGLE_PLAY_ALLOW_TEST_PURCHASES=true`.

**Environment variables (server)**

| Variable | Purpose |
|---|---|
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.bababuilds.erp.twa` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service-account key (secret) |
| `GOOGLE_PLAY_RTDN_SECRET` | Shared secret in the Pub/Sub push URL (long random string) |
| `GOOGLE_PLAY_ALLOW_TEST_PURCHASES` | `true` only while testing on production data |

**Database**: new table `PlayPurchase` (migration `20261201100000_play_billing`). Apply the reviewed migration with
`npx prisma migrate deploy`; `Workspace.billingProvider` gains the value `GOOGLE_PLAY`. Never use `db push` on production.

**Behaviour to know**
- A workspace already paid through Razorpay/Stripe that then buys on Play keeps the *longer* of the two end
  dates at the moment of linking; afterwards Google's expiry is authoritative.
- Pending purchases (e.g. cash payment methods) grant nothing until Google reports `ACTIVE`.
- Unacknowledged purchases are refunded by Google after 3 days; verify retries and RTDN make sure they are acknowledged.
- Partner/distributor coupons do not apply to Play purchases (use Play promo codes).
- **Not verified against real Google services from this repo** (no credentials were available): the request
  shapes follow Google's documented `androidpublisher v3` API and are unit-tested with mocks. Run the §5 test
  plan with a license tester before launch.

## 3b. First upload, then automated releases

**Creating the app in Play Console (once).** The first bundle must be uploaded by hand.
1. Play Console → *Create app* → name `BabaBuilds ERP`, default language, *App*, *Free* (subscriptions are sold through Play Billing, §3a), accept the declarations.
2. *Test and release → Testing → Internal testing → Create new release*. Keep **Play App Signing** on (default) and upload `app-release-bundle.aab` (version name `1.0.0`, code `1`, package `com.bababuilds.erp.twa`, minSdk 24). The bundle is signed with the *upload* key; Google re-signs it with the app-signing key.
3. Add testers (an email list), save, review and roll out. Then follow §3.4 to copy the **App signing key SHA-256** into `assetlinks.json` (the upload-key fingerprint is already there for sideloaded APKs).
4. Complete the §4 checklist (store listing, App content, Data safety).

**Keystore.** Keep `android.keystore` and its passwords in a password manager; never commit them (git-ignored). If it is lost, Play support can reset the upload key. For CI, store it as a secret: `base64 -w0 android.keystore`.

**Automated releases: `.github/workflows/android-release.yml`.** Manual (`workflow_dispatch`), `main` only, GitHub-hosted, never on pull requests. It validates inputs, builds a signed AAB with Bubblewrap, checks the signature and uploads to the chosen Play track (default `internal`). Promoting to production is a deliberate input or a Play Console action.

Setup:
1. GitHub → *Settings → Environments → New environment* `google-play` (optionally require reviewers).
2. Add these secrets **to that environment**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 android.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `bababuilds-upload` |
| `ANDROID_KEY_PASSWORD` | key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | JSON key of a service account invited in *Play Console → Users and permissions* with *Release to production, exclude devices, and use Play App Signing* (or at least *Release apps to testing tracks*) |

3. *Actions → Android release (Google Play) → Run workflow*: give `version_name` (e.g. `1.0.1`) and an integer `version_code` **greater than** `appVersionCode` in `android/twa-manifest.json`. Use `status: draft` while the app has never been released.
4. After a successful run, bump `appVersionName`/`appVersionCode` in `android/twa-manifest.json` in a PR so the next validation floor is correct.

A new TWA bundle is only needed when the shell changes (icon, shortcuts, target SDK, package settings): web changes ship through the normal deploy.

## 4. Play Console checklist

**Store listing**
- App name `BabaBuilds ERP`; category *Business* (or *Finance*); contact email, website, privacy policy
  `https://erp.bababuilds.com/privacy`.
- Icon 512×512: `public/icons/launchericon-512x512.png`.
- **Feature graphic 1024×500**: not in the repo — design one (listing screenshots are in `docs/play-store/screenshots/`).
- Phone screenshots: 2–8 (provided, 6). Add 7-inch / 10-inch tablet screenshots if you want to appear in the tablet listing.
- Short description (≤80): *Invoices, expenses, bank reconciliation and GST/VAT in one workspace.*

**App content**
- *App access*: reviewers need working credentials. Provide a demo/test account (the app has a
  demo workspace flow; create a stable reviewer account with a non-expiring PRO workspace).
- *Target audience*: 18+; *Ads*: none; *Content rating*: complete the questionnaire (business app, no UGC to public).
- *Data safety* — declare (all encrypted in transit; deletion by request): name, email, user IDs,
  financial info (invoices/transactions entered by users), files/docs, device/IP identifiers,
  app interactions/diagnostics, payment info handled by Razorpay/Stripe (not stored by you).
  Mark data as *collected* and not *sold*. Match this to `/privacy`.
- *Data deletion*: `https://erp.bababuilds.com/delete-account`.
- *Government apps / financial features*: declare "financial management/accounting"; the app does not
  provide loans or crypto.

**Release**
- Internal testing → Closed testing (12 testers × 14 days if required) → Production.
- Enable *Pre-launch report* and fix crashes it finds.

## 5. Pre-submission test plan (on a real phone)

1. Install the internal-test build. **Cold start** shows the splash then `/dashboard` (or `/login`) — no URL bar.
2. Sign in (password / Google). Check Google OAuth works inside the TWA (some IdPs block webviews; TWA uses Chrome so it should).
3. Walk the bottom tabs, open **More**, check back-button behaviour (back goes up the history, then exits).
4. Rotate to landscape; open the keyboard in a form (the bottom bar must not jump over inputs).
5. Dark mode toggle; font scale 130% (Android Settings → Display); *Reduce animations*.
6. Create an invoice (focus route: bottom bar hidden, sticky action bar visible above the gesture bar).
7. POS: add items → "Order" bar appears → jump to cart.
7a. **Billing**: as a license tester, Upgrade → Google Play sheet → purchase → plan flips to Pro/Team; no Razorpay/coupon UI visible anywhere in the app; Settings → Billing shows *Manage in Google Play*; cancel in Play and confirm the workspace stays paid until the period end, then drops to Free.
8. Airplane mode: `/offline` fallback renders.
9. Push notification opt-in on Android 13+ (permission prompt) and delivery.
10. Share a PDF/image into the app (share target) and open a CSV via `/open-file`.
11. `adb shell am start -a android.intent.action.VIEW -d https://erp.bababuilds.com/income` opens inside the app (verified links).

## 6. Mobile UI conventions (for contributors)

| Need | Use |
|---|---|
| Full-height screen inside the dashboard | `min-h-app` (**not** `min-h-screen`; tests fail on it) |
| Public page outside the shell | `min-h-dvh` |
| Floating UI (FAB, toasts, bulk-action bars) | `bottom-above-nav` (clears the bottom tab bar + gesture inset) |
| Bottom/top/side safe areas | `pb-safe`, `pt-safe`, `ps-safe`, `pe-safe` |
| Larger touch target only on touch devices | `pointer-coarse:` variant (not a viewport width check) |
| Hover-only controls | also add `pointer-coarse:opacity-100` — touch has no hover |
| Hide the bottom tab bar on a full-screen composer | add its route to `FOCUS_ROUTE_PATTERNS` in `components/layout/mobile-nav.tsx` |
| Tabs / chip rows that overflow | `scrollbar-none` + `overflow-x-auto` |
| Wide data tables | `<div class="overflow-x-auto">` wrapper, or a card list below `md` (see `InvoiceTable`) |
| Dense page-header actions | they wrap by default (`DashboardPageShell`) — don't add `shrink-0` rows |
| Modal | `ResponsiveDialog` (dialog ≥768px, bottom drawer below) |

Small controls (<44px) get a transparent 44px hit-area on coarse pointers from `app/globals.css`
without changing the visuals, so existing icon buttons don't need edits.

## 7. Known limitations / follow-ups

- **Landscape phones ≥768px wide** get the desktop sidebar layout (the mobile/desktop switch is a
  `max-width: 767px` query shared by the sidebar and many `md:` classes). Fixing it means moving to
  a pointer/height-aware breakpoint everywhere; deliberately not done here.
- Many older screens still use dense desktop tables with horizontal scroll rather than card lists
  (Invoices, Proposals and Retainers already have mobile card views).
- Settings → Security now has a *Delete account* card linking to `/delete-account` (email-based process). A feature
  graphic, tablet screenshots and on-device QA are still required before production (see §2, §4, §5).
- `tests/mobile-viewports.spec.ts` (Playwright) fails on horizontal overflow at 360/390/412px across the main routes.
