/**
 * After a deploy, tabs and the service worker can still hold HTML/JS that references chunk
 * files which no longer exist. Those failures look like random "something went wrong" screens.
 */
const STALE_DEPLOY_PATTERN =
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleDeployError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return STALE_DEPLOY_PATTERN.test(`${error.name ?? ""} ${error.message ?? ""}`);
}

const RECOVERY_FLAG = "erp_stale_deploy_recovered_at";
const RECOVERY_COOLDOWN_MS = 60_000;

/** Unregister service workers, drop caches and reload — at most once per minute (no reload loops). */
export async function recoverFromStaleDeploy(): Promise<boolean> {
  try {
    const last = Number(window.sessionStorage.getItem(RECOVERY_FLAG) ?? 0);
    if (Date.now() - last < RECOVERY_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RECOVERY_FLAG, String(Date.now()));
  } catch {
    return false;
  }

  try {
    const registrations = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* best effort */
  }
  window.location.reload();
  return true;
}
