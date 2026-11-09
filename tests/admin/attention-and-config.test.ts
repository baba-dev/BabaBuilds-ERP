import { describe, expect, it } from "vitest";
import { buildAttention, type AttentionInput } from "@/lib/admin/attention";
import { checkConfig, configSummary } from "@/lib/admin/config-health";

const quiet: AttentionInput = { expiredPaid: 0, expiredTrials: 0, trialsEndingSoon: 0, suspended: 0, configMissing: 0, configWarnings: 0, lastBackupAgeHours: 5, authFailures: 0, integrityViolations: 0 };

describe("attention list", () => {
  it("is empty when nothing needs the operator", () => {
    expect(buildAttention(quiet)).toEqual([]);
  });

  it("orders critical before warning before info, and says where to go", () => {
    const items = buildAttention({ ...quiet, suspended: 2, expiredPaid: 3, configMissing: 1, trialsEndingSoon: 4 });
    expect(items.map((i) => i.key)).toEqual(["CONFIG_MISSING", "EXPIRED_PAID", "TRIALS_ENDING", "SUSPENDED"]);
    expect(items[1].href).toContain("/admin/accounts");
  });

  it("treats no backup as critical and an old one as a warning", () => {
    expect(buildAttention({ ...quiet, lastBackupAgeHours: null })[0]).toMatchObject({ key: "NO_BACKUP", severity: "critical" });
    expect(buildAttention({ ...quiet, lastBackupAgeHours: 100 })[0]).toMatchObject({ key: "BACKUP_STALE", severity: "warning", count: 4 });
    expect(buildAttention({ ...quiet, lastBackupAgeHours: 72 })).toEqual([]);
  });

  it("only flags sign-in failures once they pile up", () => {
    expect(buildAttention({ ...quiet, authFailures: 24 })).toEqual([]);
    expect(buildAttention({ ...quiet, authFailures: 25 })[0].key).toBe("AUTH_FAILURES");
  });
});

describe("configuration health", () => {
  const prod = { NODE_ENV: "production" } as Record<string, string>;
  const by = (checks: ReturnType<typeof checkConfig>, key: string) => checks.find((c) => c.key === key);

  it("requires the allowlist in every environment, and the rest only in production", () => {
    expect(by(checkConfig({}), "SUPERADMIN_EMAILS")).toMatchObject({ status: "missing", required: true });
    expect(by(checkConfig({ NODE_ENV: "development" }), "CRON_SECRET")).toMatchObject({ status: "warn", required: false });
    expect(by(checkConfig(prod), "CRON_SECRET")).toMatchObject({ status: "missing", required: true });
  });

  it("validates shape without ever returning a value", () => {
    const env = { ...prod, SUPERADMIN_EMAILS: "a@b.in", NEXTAUTH_SECRET: "short", ENCRYPTION_KEY: "nothex", CRON_SECRET: "x" };
    const checks = checkConfig(env);
    expect(by(checks, "NEXTAUTH_SECRET")?.status).toBe("warn");
    expect(by(checks, "ENCRYPTION_KEY")?.status).toBe("missing");
    expect(by(checkConfig({ ...env, ENCRYPTION_KEY: "a".repeat(64) }), "ENCRYPTION_KEY")?.status).toBe("ok");
    expect(JSON.stringify(checks)).not.toContain("nothex");
    expect(JSON.stringify(checks)).not.toContain("a@b.in");
  });

  it("summarises missing and warning counts", () => {
    const s = configSummary(checkConfig(prod));
    expect(s.missing).toBeGreaterThan(0);
    expect(configSummary(checkConfig({ ...prod, SUPERADMIN_EMAILS: "a@b.in" })).missing).toBe(s.missing - 1);
  });
});
