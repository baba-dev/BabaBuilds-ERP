const fs = require('fs');

const routePath = 'app/api/dashboard/route.ts';
let code = fs.readFileSync(routePath, 'utf8');

const safeTimed = `  const safeTimed = async <T,>(label: string, fallback: T, op: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } catch (err) {
      console.warn(\`[Dashboard] Safe query failed \${label}:\`, err instanceof Error ? err.message : String(err));
      return fallback;
    } finally {
      queryTimingsMs[label] = Number((performance.now() - startedAt).toFixed(2));
    }
  };
`;

code = code.replace('  const timed = async', safeTimed + '\n  const timed = async');

// Now we need to manually chunk the Promise.all.
// Instead of complex AST parsing, let's just use string replacement on the known variables and blocks.

const variablesPart = `  const [
    workspace,
    workspaceOwner,
    currentUser,
    profile,
    invoices,
    openInvoiceAgingBuckets,
    recentInvoices,
    investmentAggregate,
    expenses,
    bankTransactionGroups,
    retainers,
    proposalStatusGroups,
    taskCount,
    openTaskCount,
    urgentTaskCount,
    blockedTaskCount,
    publishedProducts,
    lowStockProducts,
    openPurchaseOrders,
    inventoryMovements,
    shopOrderStatusGroups,
    paidOrderRevenueThisMonth,
    paidOrderRevenuePreviousMonth,
    ordersLast30Days,
    ordersPrior30Days,
    topProductOrderGroups,
    recentShopOrders,
    integrityRuns,
    violationCount,
    criticalViolationCount,
    taxOverrides,
    taxAudits,
    fileImportFailures,
    activities,
    notifications,
    pendingOrderAgingBuckets,
    taxReadinessSummary,
  ] = await Promise.all([`;

const newAssignments = `  const [
    workspace,
    workspaceOwner,
    currentUser,
    profile,
  ] = await Promise.all([`;

code = code.replace(variablesPart, newAssignments);

// Replace the first chunk boundary (after profile)
const profileEnd = `      };
    }),`;

const chunk2Start = `
  const [
    invoices,
    openInvoiceAgingBuckets,
    recentInvoices,
    investmentAggregate,
    expenses,
    bankTransactionGroups,
    retainers,
  ] = await Promise.all([`;

code = code.replace(profileEnd, profileEnd + chunk2Start);

// Replace the second chunk boundary (after retainers)
const retainersEnd = `    timed("retainers.active", () =>
      prisma.retainer.findMany({
        where: { workspaceId, status: "ACTIVE" },
        select: { items: { select: { quantity: true, unitPrice: true } }, nextBillingDate: true, createdAt: true },
      })
    ),`;

const chunk3Start = `
  ]);

  const [
    proposalStatusGroups,
    taskCount,
    openTaskCount,
    urgentTaskCount,
    blockedTaskCount,
    publishedProducts,
    lowStockProducts,
    openPurchaseOrders,
    inventoryMovements,
  ] = await Promise.all([`;

code = code.replace(retainersEnd, retainersEnd + chunk3Start);

// Replace the third chunk boundary (after inventoryMovements)
const inventoryMovementsEnd = `    timed("inventory.recent", () =>
      prisma.inventoryMovement.findMany({
        where: { workspaceId },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    ),`;

const chunk4Start = `
  ]);

  const [
    shopOrderStatusGroups,
    paidOrderRevenueThisMonth,
    paidOrderRevenuePreviousMonth,
    ordersLast30Days,
    ordersPrior30Days,
    topProductOrderGroups,
    recentShopOrders,
    pendingOrderAgingBuckets,
  ] = await Promise.all([`;

code = code.replace(inventoryMovementsEnd, inventoryMovementsEnd + chunk4Start);

// We need to move pendingOrderAgingBuckets to be in chunk 4 before integrityRuns
// Wait, in the original code, pendingOrderAgingBuckets is right before taxReadinessSummary.
// Let's modify the chunks to match the exact order of the original Promise.all elements.

`;

fs.writeFileSync('scratch/patch1.js', code);
