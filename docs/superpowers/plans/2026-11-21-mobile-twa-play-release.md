# Mobile polish, first Play AAB and release workflow — Implementation Plan

> **For agentic workers:** use superpowers:executing-plans. Steps use checkboxes.

**Goal:** Polish phone UX, produce the first signed AAB, add a manual GitHub Action that publishes to Play internal track.

**Architecture:** Existing Next.js PWA + Bubblewrap TWA shell (`android/twa-manifest.json`). Mobile fixes follow `docs/android-play-store.md` §6 conventions. Release workflow runs only on `workflow_dispatch`, GitHub-hosted.

**Tech Stack:** Next.js 16, Tailwind, Playwright, Vitest, Bubblewrap, r0adkll/upload-google-play.

**Spec:** `docs/superpowers/specs/2026-11-21-mobile-twa-play-release-design.md`

## Global Constraints
- Use `min-h-app` in dashboard shell, `min-h-dvh` on public pages; `bottom-above-nav`, `pb-safe`, `pointer-coarse:` variants.
- Never commit keystores/passwords; workflow never triggers on pull requests.
- Run `npm run ci:fast` before pushing; no new lint warnings.
- Package `com.bababuilds.erp.twa` must match in twa-manifest and assetlinks.

## Review Focus
- 360px-wide screens with long client names/amounts must not scroll horizontally.
- Keyboard open in forms must not cover inputs (focus routes).
- Workflow given a versionCode <= current must fail before building.
- Delete-account entry must work for users who cannot self-serve (links to `/delete-account`).
- Keystore/secret values must never be echoed in logs.

### Task 1: Mobile audit and fixes
**Files:** Create `tests/browser/mobile-viewports.spec.ts` (Playwright, 360/390/412 widths, no horizontal overflow on demo-login routes); modify offending components found.
- [ ] Write spec asserting `document.documentElement.scrollWidth <= innerWidth` per route; run it, record failures.
- [ ] Fix each failure with the §6 conventions; re-run until green.
- [ ] Commit.

### Task 2: In-app delete account entry
**Files:** Settings page component; test in `tests/mobile/`.
- [ ] Failing test: settings renders a link to `/delete-account`; implement; commit.

### Task 3: Release workflow
**Files:** Create `.github/workflows/android-release.yml`; test in `tests/mobile/android-release-workflow.test.ts`.
- [ ] Test asserts: only `workflow_dispatch`, no `pull_request`, references the five secrets, track `internal`, no `echo` of secrets.
- [ ] Implement workflow (input `version_code`, `version_name`; validate > current; bubblewrap build; upload AAB).
- [ ] Commit.

### Task 4: First AAB and docs
**Files:** Modify `docs/android-play-store.md`; produce `android.keystore`+`.aab` (git-ignored, delivered to user).
- [ ] Install JDK 17 + Android SDK + Bubblewrap; generate upload keystore; `bubblewrap build`.
- [ ] Document Console creation steps and secrets; run `npm run ci:fast`; push; open draft PR.
