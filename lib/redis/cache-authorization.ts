import 'server-only';

import { createHash } from 'node:crypto';
import { getGrantedPermissions } from '@/lib/rbac';
import { getEnabledModules } from '@/lib/modules';
import type { Permission } from '@/lib/permissions';

/** Live, DB-backed permission + module fingerprint. Never derive this from a JWT. */
export function fingerprintCacheAuthorization(
  grants: Readonly<Record<string, boolean>>,
  modules: ReadonlySet<string>,
): string {
  const allowed = Object.entries(grants).filter(([, ok]) => ok).map(([permission]) => permission).sort();
  const enabled = [...modules].sort();
  return createHash('sha256').update(JSON.stringify([allowed, enabled])).digest('hex');
}

/**
 * Performs FRESH DB permission and module lookups before every cache access.
 * A revoked/deactivated user or disabled module cannot use old Redis entries.
 * An explicit missing grant denies the cache path; this check is separate from
 * existing route authorization which must remain in place.
 */
export async function resolveLiveCacheAuthorization(
  userId: string,
  workspaceId: string,
  requiredPermission: Permission,
): Promise<{ fingerprint: string } | null> {
  if (!userId || !workspaceId) return null;
  const [grants, modules] = await Promise.all([
    getGrantedPermissions(userId, workspaceId),
    getEnabledModules(workspaceId),
  ]);
  if (!grants[requiredPermission]) return null;
  return { fingerprint: fingerprintCacheAuthorization(grants, modules) };
}
