export type AttentionItem = { key: string; severity: "critical" | "warning" | "info"; count: number; href: string };

export type AttentionInput = {
  expiredPaid: number;
  expiredTrials: number;
  trialsEndingSoon: number;
  suspended: number;
  configMissing: number;
  configWarnings: number;
  /** Age of the newest backup in hours, or null when there is none. */
  lastBackupAgeHours: number | null;
  authFailures: number;
  integrityViolations: number;
};

/** What needs the operator, most urgent first. Nothing here is a score: each line is a count with somewhere to go. */
export function buildAttention(i: AttentionInput): AttentionItem[] {
  const items: Array<AttentionItem | null> = [
    i.integrityViolations > 0 ? { key: "AUDIT_INTEGRITY", severity: "critical", count: i.integrityViolations, href: "/admin/logs" } : null,
    i.configMissing > 0 ? { key: "CONFIG_MISSING", severity: "critical", count: i.configMissing, href: "/admin/security" } : null,
    i.lastBackupAgeHours === null ? { key: "NO_BACKUP", severity: "critical", count: 1, href: "/admin/operations" } : i.lastBackupAgeHours > 72 ? { key: "BACKUP_STALE", severity: "warning", count: Math.floor(i.lastBackupAgeHours / 24), href: "/admin/operations" } : null,
    i.expiredPaid > 0 ? { key: "EXPIRED_PAID", severity: "warning", count: i.expiredPaid, href: "/admin/accounts?access=EXPIRED_PAID" } : null,
    i.trialsEndingSoon > 0 ? { key: "TRIALS_ENDING", severity: "info", count: i.trialsEndingSoon, href: "/admin/accounts?access=TRIAL" } : null,
    i.expiredTrials > 0 ? { key: "EXPIRED_TRIALS", severity: "info", count: i.expiredTrials, href: "/admin/accounts?access=EXPIRED_TRIAL" } : null,
    i.suspended > 0 ? { key: "SUSPENDED", severity: "info", count: i.suspended, href: "/admin/accounts?access=SUSPENDED" } : null,
    i.configWarnings > 0 ? { key: "CONFIG_WARNINGS", severity: "info", count: i.configWarnings, href: "/admin/security" } : null,
    i.authFailures >= 25 ? { key: "AUTH_FAILURES", severity: "warning", count: i.authFailures, href: "/admin/security" } : null,
  ];
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return items.filter((x): x is AttentionItem => x !== null).sort((a, b) => order[a.severity] - order[b.severity]);
}
