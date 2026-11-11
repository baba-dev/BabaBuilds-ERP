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
| Regression tests | `tests/mobile/mobile-readiness.test.ts` |

## 2. Decisions / risks you must own (cannot be solved in code alone)

1. **Google Play Payments policy.** The app sells subscriptions through Razorpay/Stripe. Play
   requires Google Play Billing for digital goods and services unlocked inside an app unless an
   exemption applies. For a B2B ERP this is a grey area. Before submitting, read the current
   *Payments* policy and decide one of: (a) hide upgrade/checkout screens inside the TWA and send
   users to the website to subscribe, (b) integrate Play Billing through the Digital Goods API, or
   (c) confirm an exemption with Play support in writing. Submitting without a decision is the most
   likely cause of a rejection. (Detecting the TWA: `document.referrer` starts with
   `android-app://com.bababuilds.erp.twa` on first load — persist it in `sessionStorage`.)
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
- In-app account deletion, Play Billing decision, a feature graphic, tablet screenshots and
  on-device QA are required before production (see §2, §4, §5).
