/**
 * Deliberately separate from the Next.js web process.
 *
 * Run this only from a locked-down operator/worker account after the web API has
 * recorded both super-admin and offline-signature approval:
 *   npx tsx scripts/diagnostics-remediation-worker.ts <remediation-id>
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "@/lib/prisma";
import {
  expectedPrismaActionType,
  parseRemediationContent,
  type RemediationAction,
} from "@/lib/diagnostics/remediation-policy";

const execFileAsync = promisify(execFile);
const MAX_LOG_LENGTH = 8_000;

async function executeAllowlistedAction(action: RemediationAction) {
  if (action.action === "RESTART_WEB") {
    return execFileAsync(
      "/usr/bin/systemctl",
      ["restart", "bababuilds-erp.service"],
      { shell: false, timeout: 30_000, maxBuffer: 64 * 1024 },
    );
  }

  return execFileAsync(
    "/usr/bin/cscli",
    ["decisions", "add", "--ip", action.ip, "--duration", "24h", "--reason", "erp-approved-diagnostic"],
    { shell: false, timeout: 30_000, maxBuffer: 64 * 1024 },
  );
}

async function main() {
  const remediationId = process.argv[2]?.trim();
  if (!remediationId || process.argv.length !== 3) {
    throw new Error("Usage: diagnostics-remediation-worker.ts <remediation-id>");
  }

  const remediation = await prisma.systemRemediation.findUnique({
    where: { id: remediationId },
  });
  if (!remediation) throw new Error("Remediation not found");
  if (remediation.status !== "APPROVED") throw new Error("Remediation is not approved");

  const claim = await prisma.systemRemediation.updateMany({
    where: { id: remediation.id, status: "APPROVED" },
    data: { status: "EXECUTING", executedAt: new Date() },
  });
  if (claim.count !== 1) throw new Error("Remediation was already claimed");

  try {
    const action = parseRemediationContent(remediation.content);
    if (remediation.actionType !== expectedPrismaActionType(action)) {
      throw new Error("Stored remediation type does not match its payload");
    }

    const result = await executeAllowlistedAction(action);
    await prisma.systemRemediation.update({
      where: { id: remediation.id },
      data: {
        status: "SUCCESS",
        executionLog: JSON.stringify({
          approval: remediation.executionLog,
          execution: {
            completedAt: new Date().toISOString(),
            action: action.action,
            stdout: String(result.stdout || "").slice(0, MAX_LOG_LENGTH),
            stderr: String(result.stderr || "").slice(0, MAX_LOG_LENGTH),
          },
        }),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.systemRemediation.update({
      where: { id: remediation.id },
      data: {
        status: "FAILED",
        executionLog: JSON.stringify({
          approval: remediation.executionLog,
          execution: { failedAt: new Date().toISOString(), error: message.slice(0, MAX_LOG_LENGTH) },
        }),
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
