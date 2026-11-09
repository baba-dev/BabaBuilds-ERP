import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../../authz";
import { checkConfig } from "@/lib/admin/config-health";
import { getAuthFailureMetrics } from "@/lib/auth-observability";
import { getRouteRateLimitIpConcentration, getRouteRateLimitMetrics } from "@/lib/route-rate-limit";
import { validateTaxOverrideAuditChain } from "@/lib/security/activity-log";

/** Configuration by name (never values), sign-in failures, rate-limit hits and the tax audit chain check. */
export async function GET() {
  try {
    await verifySuperAdmin();
    const failures = getAuthFailureMetrics();
    const limits = getRouteRateLimitMetrics();
    const byRoute = limits.reduce<Record<string, number>>((acc, e) => { acc[e.route] = (acc[e.route] ?? 0) + 1; return acc; }, {});
    const integrity = await validateTaxOverrideAuditChain();
    return NextResponse.json({
      config: checkConfig(process.env),
      authFailures: { total: failures.reduce((s, r) => s + r.count, 0), byReason: failures.slice(0, 12) },
      rateLimits: { hits: limits.length, byRoute: Object.entries(byRoute).map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 10), topIps: getRouteRateLimitIpConcentration(5) },
      auditChain: { valid: integrity.valid, checked: integrity.checked, violations: integrity.violations.length },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load security status");
  }
}
