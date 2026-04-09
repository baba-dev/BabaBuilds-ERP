const DEFAULT_DASHBOARD_ROUTE = '/dashboard';

export const DASHBOARD_LAUNCH_QUERY_KEY = 'launchTo';

function isSafeInternalPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//');
}

export function normalizeLaunchDestination(destination: string): string {
  if (!destination) {
    return DEFAULT_DASHBOARD_ROUTE;
  }

  try {
    const base = 'https://erp.bababuilds.local';
    const parsed = new URL(destination, base);
    const normalizedTarget = `${parsed.pathname}${parsed.search}${parsed.hash}`;

    if (!isSafeInternalPath(normalizedTarget)) {
      return DEFAULT_DASHBOARD_ROUTE;
    }

    if (parsed.pathname === DEFAULT_DASHBOARD_ROUTE) {
      return normalizedTarget;
    }

    const dashboardParams = new URLSearchParams(parsed.search);
    dashboardParams.set(DASHBOARD_LAUNCH_QUERY_KEY, normalizedTarget);

    return `${DEFAULT_DASHBOARD_ROUTE}?${dashboardParams.toString()}`;
  } catch {
    return DEFAULT_DASHBOARD_ROUTE;
  }
}

export function resolveDashboardLaunchTarget(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get(DASHBOARD_LAUNCH_QUERY_KEY);

  if (!raw) {
    return null;
  }

  if (!isSafeInternalPath(raw)) {
    return null;
  }

  return raw;
}
