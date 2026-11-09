import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { loadPlatformOverview } from "@/lib/admin/overview";
import { buildAttention } from "@/lib/admin/attention";
import { checkConfig, configSummary } from "@/lib/admin/config-health";
import { getAuthFailureMetrics } from "@/lib/auth-observability";

async function newestBackup(): Promise<{ at: string | null; count: number }> {
  try {
    const dir = path.join(process.cwd(), "backups");
    const zips = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(".zip"));
    const times = await Promise.all(zips.map(async (f) => (await fs.promises.stat(path.join(dir, f))).mtimeMs));
    return { at: times.length ? new Date(Math.max(...times)).toISOString() : null, count: zips.length };
  } catch {
    return { at: null, count: 0 };
  }
}

/** Everything the console's first screen needs, in one call. */
export async function GET() {
  try {
    await verifySuperAdmin();
    const [overview, backup] = await Promise.all([loadPlatformOverview(), newestBackup()]);
    const config = configSummary(checkConfig(process.env));
    const authFailures = getAuthFailureMetrics().reduce((s, r) => s + r.count, 0);
    const attention = buildAttention({
      expiredPaid: overview.revenue.expiredPaid,
      expiredTrials: overview.trials.expired,
      trialsEndingSoon: overview.trials.endingSoon,
      suspended: overview.plans.suspended,
      configMissing: config.missing,
      configWarnings: config.warnings,
      lastBackupAgeHours: backup.at ? (Date.now() - new Date(backup.at).getTime()) / 3_600_000 : null,
      authFailures,
      integrityViolations: 0,
    });
    return NextResponse.json({ ...overview, backup, attention, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleAdminApiError(error, "Failed to load the overview");
  }
}
