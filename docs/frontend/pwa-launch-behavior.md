# PWA launch and deep-link behavior

This document describes the expected launch routing behavior for BabaBuilds ERP when installed as a PWA.

## Cold start

When no ERP window is open and the app is launched (icon, protocol, or direct URL):

1. The app starts on `/dashboard`.
2. If a deep-link is present, startup logic stores it in `launchTo` and enters via `/dashboard`.
3. Dashboard entry immediately routes to the requested module while preserving intent query params.
4. If authentication is required, login keeps `callbackUrl` intact and resumes the same launch target after sign-in.

## Warm start

When an ERP client window already exists:

1. `launch_handler.client_mode` is set to `focus-existing`.
2. The existing client is focused instead of opening additional windows.
3. Any deep-link is routed through `/dashboard?launchTo=...` and then forwarded to the intended module.

## Notification click

For push notification clicks:

1. Service worker reads `notification.data.url`.
2. The destination is normalized into dashboard-entry format.
3. Existing client is focused and navigated, or a new window is opened only if no client exists.
4. Intent query parameters from the original notification URL are preserved.

## File-open launch

For file-open driven launches (or similar external intents):

1. The entry URL should include the intended module and file identifiers in query params.
2. Startup routing wraps this intent as `launchTo` when needed.
3. Dashboard entry redirects to the target module with all original intent parameters preserved.
4. If login is required, `callbackUrl` continues to carry this normalized target so post-auth routing is deterministic.
