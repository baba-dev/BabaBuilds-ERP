import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedDemoWorkspace } from "@/lib/demo/seed-workspace";
import { DEMO_TEMPLATE_KEYS, getDemoTemplate, type DemoTemplateKey } from "@/lib/demo/templates";

describe("demo template seeding smoke", () => {
  it.each(DEMO_TEMPLATE_KEYS)("seeds %s template with expected artifacts and KPI surfaces", async (templateKey) => {
    const key = templateKey as DemoTemplateKey;
    const template = getDemoTemplate(key);

    const user = await prisma.user.create({
      data: {
        name: `Template Test ${key}`,
        email: `template_test_${key}_${Date.now()}@bababuilds.demo`,
        role: "DEMO",
      },
    });

    let workspaceId: string | null = null;
    try {
      const result = await prisma.$transaction((tx) => seedDemoWorkspace(tx, { userId: user.id, templateKey: key }));
      workspaceId = result.workspaceId;

      const [
        clientsCount,
        servicesCount,
        proposalsCount,
        invoices,
        expenses,
        investmentsCount,
        retainersCount,
        enabledModules,
        workspace,
      ] = await Promise.all([
        prisma.client.count({ where: { workspaceId } }),
        prisma.serviceTemplate.count({ where: { workspaceId } }),
        prisma.proposal.count({ where: { workspaceId } }),
        prisma.invoice.findMany({ where: { workspaceId }, select: { status: true, totalAmount: true } }),
        prisma.expense.findMany({ where: { workspaceId }, select: { amount: true } }),
        prisma.investment.count({ where: { workspaceId } }),
        prisma.retainer.count({ where: { workspaceId } }),
        prisma.workspaceModule.findMany({ where: { workspaceId, isEnabled: true }, select: { moduleKey: true } }),
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { demoTemplateKey: true } }),
      ]);

      expect(clientsCount).toBe(template.clients.length);
      expect(servicesCount).toBe(template.services.length);
      expect(proposalsCount).toBe(template.proposals.length);
      expect(invoices.length).toBe(template.invoices.length);
      expect(expenses.length).toBe(template.expenses.length);
      expect(investmentsCount).toBe(template.investments.length);
      expect(retainersCount).toBe(template.retainers.length);
      expect(workspace?.demoTemplateKey).toBe(key);

      const expectedEnabledModules = Object.entries(template.modules)
        .filter(([, enabled]) => enabled)
        .map(([moduleKey]) => moduleKey)
        .sort();
      expect(enabledModules.map((m) => m.moduleKey).sort()).toEqual(expectedEnabledModules);

      const paidInvoices = invoices.filter((invoice) => invoice.status === "PAID").length;
      const pendingInvoices = invoices.filter((invoice) => invoice.status === "PENDING").length;
      const totalRevenue = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

      const expectedPaid = template.invoices.filter((invoice) => invoice.status === "PAID").length;
      const expectedPending = template.invoices.filter((invoice) => invoice.status === "PENDING").length;
      const expectedRevenue = template.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
      const expectedExpenses = template.expenses.reduce((sum, expense) => sum + expense.amount, 0);

      expect(paidInvoices).toBe(expectedPaid);
      expect(pendingInvoices).toBe(expectedPending);
      expect(totalRevenue).toBe(expectedRevenue);
      expect(totalExpenses).toBe(expectedExpenses);
    } finally {
      if (workspaceId) {
        await prisma.workspace.delete({ where: { id: workspaceId } });
      }
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
