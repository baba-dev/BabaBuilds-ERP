import type { Prisma } from "@prisma/client";
import { decimalToNumber } from "@/lib/money";
import { encrypt } from "@/lib/encryption";
import { getDemoTemplate, type DemoTemplateKey } from "@/lib/demo/templates";

const MODULE_KEYS = ["WORKFORCE", "PAYROLL", "DOCUMENTS", "REVENUE_PIPELINE", "CASH_FLOW", "TAX_ADVANCED"] as const;

const getDateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

const getFY = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (month < 4) return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
  return `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
};

export async function seedDemoWorkspace(
  tx: Prisma.TransactionClient,
  params: { userId: string; templateKey: DemoTemplateKey },
) {
  const template = getDemoTemplate(params.templateKey);

  const workspace = await tx.workspace.create({
    data: {
      name: template.workspace.name,
      countryCode: template.workspace.countryCode,
      baseCurrency: template.workspace.baseCurrency,
      planTier: template.workspace.planTier,
      subscriptionStatus: template.workspace.subscriptionStatus,
      demoTemplateKey: template.key,
      users: {
        create: { userId: params.userId, role: "OWNER" },
      },
    },
  });

  const { groqApiKeyPlaintext, ...businessProfile } = template.businessProfile;

  await tx.businessProfile.create({
    data: {
      workspaceId: workspace.id,
      ...businessProfile,
      groqApiKey: groqApiKeyPlaintext ? encrypt(groqApiKeyPlaintext) : undefined,
    },
  });

  const clientByRef = new Map<string, { id: string; name: string; isExport: boolean }>();
  for (const client of template.clients) {
    const created = await tx.client.create({
      data: {
        workspaceId: workspace.id,
        name: client.name,
        address: client.address,
        country: client.country,
        taxId: client.taxId,
        email: client.email,
        isExport: client.isExport,
      },
    });
    clientByRef.set(client.ref, { id: created.id, name: created.name, isExport: created.isExport });
  }

  await tx.serviceTemplate.createMany({
    data: template.services.map((service) => ({
      workspaceId: workspace.id,
      name: service.name,
      defaultPrice: service.defaultPrice,
      description: service.description,
    })),
  });

  const createdServices = await tx.serviceTemplate.findMany({ where: { workspaceId: workspace.id } });
  const serviceByRef = new Map(
    template.services.map((service, idx) => [service.ref, createdServices[idx]] as const),
  );

  for (const proposal of template.proposals) {
    const client = clientByRef.get(proposal.clientRef);
    const service = serviceByRef.get(proposal.serviceRef);
    if (!client || !service) continue;

    const unitPrice = decimalToNumber(service.defaultPrice);
    const subtotal = proposal.quantity * unitPrice;
    const estimatedTax = client.isExport ? 0 : subtotal * 0.18;

    await tx.proposal.create({
      data: {
        workspaceId: workspace.id,
        clientId: client.id,
        title: proposal.title,
        proposalNo: proposal.proposalNo,
        status: proposal.status,
        validUntil: getDateOffset(proposal.validDays),
        subtotal,
        estimatedTax,
        totalAmount: subtotal + estimatedTax,
        items: {
          create: [
            {
              serviceTemplateId: service.id,
              title: service.name,
              description: service.description,
              quantity: proposal.quantity,
              unitPrice,
              total: subtotal,
            },
          ],
        },
      },
    });
  }

  for (let i = 0; i < template.invoices.length; i++) {
    const invoice = template.invoices[i];
    const client = clientByRef.get(invoice.clientRef);
    if (!client) continue;

    const invoiceDate = getDateOffset(invoice.daysAgo);
    const fy = getFY(invoiceDate);

    await tx.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: client.id,
        invoiceNumber: `INV-${fy.replace("-", "")}-${String(i + 1).padStart(3, "0")}`,
        financialYear: fy,
        billingMonth: invoiceDate.toLocaleString("default", { month: "long", year: "numeric" }),
        invoiceDate,
        clientName: client.name,
        sacCode: template.businessProfile.defaultSacCode ?? "998313",
        serviceDescription: invoice.description,
        totalAmount: invoice.amount,
        status: invoice.status,
        pdfPath: `/demo-invoices/${template.key}-INV-${i + 1}.pdf`,
        amountReceived: invoice.status === "PAID" ? invoice.amount : null,
        dateReceived: invoice.status === "PAID" ? getDateOffset(invoice.daysAgo + 5) : null,
      },
    });
  }

  await tx.expense.createMany({
    data: template.expenses.map((expense) => ({
      workspaceId: workspace.id,
      date: getDateOffset(expense.daysAgo),
      category: expense.category,
      vendor: expense.vendor,
      amount: expense.amount,
      description: expense.description,
    })),
  });

  await tx.investment.createMany({
    data: template.investments.map((investment) => ({
      workspaceId: workspace.id,
      date: getDateOffset(investment.daysAgo),
      category: investment.category,
      assetName: investment.assetName,
      amount: investment.amount,
    })),
  });

  for (const retainer of template.retainers) {
    const client = clientByRef.get(retainer.clientRef);
    if (!client) continue;
    await tx.retainer.create({
      data: {
        workspaceId: workspace.id,
        clientId: client.id,
        serviceName: retainer.serviceName,
        amount: retainer.amount,
        frequency: retainer.frequency,
        autoAppendMonth: retainer.autoAppendMonth,
        nextBillingDate: getDateOffset(retainer.nextBillingInDays),
        status: retainer.status,
        sacCode: retainer.sacCode,
      },
    });
  }

  for (const moduleKey of MODULE_KEYS) {
    const enabled = Boolean(template.modules[moduleKey]);
    if (!enabled) continue;
    await tx.workspaceModule.upsert({
      where: { workspaceId_moduleKey: { workspaceId: workspace.id, moduleKey } },
      update: { isEnabled: true, enabledAt: new Date(), disabledAt: null },
      create: { workspaceId: workspace.id, moduleKey, isEnabled: true },
    });
  }

  return { workspaceId: workspace.id, templateKey: template.key };
}
