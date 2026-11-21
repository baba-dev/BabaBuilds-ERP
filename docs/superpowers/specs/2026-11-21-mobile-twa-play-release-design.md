# Mobile polish, first Play bundle and Play release workflow (design)

## Intent
Make the ERP good on phones, get the TWA onto Google Play (the Play app does not exist yet, so the first
signed AAB must be uploaded by hand), then let GitHub Actions publish later releases.

## Goals
- Playwright audit at 360/390/412px of main screens; fix overflow, touch-target and keyboard issues; add tests.
- In-app "Delete account" entry (Play requirement) pointing at the existing deletion flow.
- First signed AAB built in the dev session with Bubblewrap and a freshly generated upload keystore, delivered to the user.
- `.github/workflows/android-release.yml`: manual (`workflow_dispatch`), GitHub-hosted, builds signed AAB and uploads to Play internal track.
- Update `docs/android-play-store.md` with Console creation steps and secrets.

## Non-goals / anti-goals
- No Capacitor/React Native; no change to production deploy or Node 22 release.
- Never commit keystores or passwords; no PR-triggered execution of the workflow (repo is public).
- No automatic promotion to production.

## Approaches
1. Build first AAB in session (chosen; Play App Signing makes it only an upload key).
2. Build in CI and publish keystore as artifact (rejected: public repo).
3. User builds locally (fallback if the sandbox cannot fetch the Android SDK).

## Decisions
- Secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD, PLAY_SERVICE_ACCOUNT_JSON.
- Upload action: r0adkll/upload-google-play, pinned by version; track `internal`.
- Version code: workflow input, validated to be greater than twa-manifest's current value.

## Left to builder
Which screens/fixes the audit finds; exact test shapes; workflow step details.
