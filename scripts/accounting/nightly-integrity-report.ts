import { prisma } from '@/lib/prisma';
import { persistAccountingIntegrityRun } from '@/lib/accounting/integrity';

async function main() {
  const workspaceArg = process.argv.find((arg) => arg.startsWith('--workspace='));
  const workspaceId = workspaceArg?.split('=')[1];

  const workspaces = workspaceId
    ? [{ id: workspaceId }]
    : await prisma.workspace.findMany({ select: { id: true } });

  const output: Array<Record<string, unknown>> = [];

  for (const workspace of workspaces) {
    const result = await persistAccountingIntegrityRun(workspace.id);
    output.push({
      workspaceId: workspace.id,
      runId: result.runId,
      summary: result.summary,
      violations: result.violations,
    });
  }

  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), output }, null, 2));
}

main()
  .catch((error) => {
    console.error('[nightly-integrity-report] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
