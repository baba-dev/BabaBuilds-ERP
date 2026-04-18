import type { Prisma } from '@prisma/client';
import { decimalToNumber } from '@/lib/money';
import { encrypt } from '@/lib/encryption';
import { MODULE_KEYS } from '@/lib/modules';
import { getDemoTemplate, type DemoTemplateKey } from '@/lib/demo/templates';

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

type Tx = Prisma.TransactionClient;

export async function seedDemoWorkspace(
  tx: Tx,
  params: { userId: string; templateKey: DemoTemplateKey; ttlHours: number },
): Promise<{ workspaceId: string; templateKey: DemoTemplateKey }> {
  const template = getDemoTemplate(params.templateKey);
  const expiresAt = new Date(Date.now() + params.ttlHours * 60 * 60 * 1000);

  const workspace = await tx.workspace.create({
    data: {
      ...template.workspace,
      isDemo: true,
      demoTemplateKey: template.key,
      demoExpiresAt: expiresAt,
      users: {
        create: { userId: params.userId, role: 'OWNER' },
      },
    },
    select: { id: true },
  });

  await tx.user.update({
    where: { id: params.userId },
    data: { isDemo: true, demoTemplateKey: template.key, demoExpiresAt: expiresAt },
  });

  await tx.businessProfile.create({
    data: {
      workspaceId: workspace.id,
      ...template.businessProfile,
      ...(template.businessProfile.groqApiKeyPlaintext
        ? { groqApiKey: encrypt(template.businessProfile.groqApiKeyPlaintext) }
        : {}),
    } as Prisma.BusinessProfileUncheckedCreateInput,
  });

  const clientIdByRef = new Map<string, string>();
  for (const c of template.clients) {
    const created = await tx.client.create({
      data: {
        workspaceId: workspace.id,
        name: c.name,
        address: c.address ?? '',
        country: c.country ?? '',
        email: c.email ?? null,
        taxId: c.taxId ?? null,
        isExport: c.isExport,
      },
      select: { id: true },
    });
    clientIdByRef.set(c.ref, created.id);
  }

  await tx.serviceTemplate.createMany({
    data: template.services.map((s) => ({
      workspaceId: workspace.id,
      name: s.name,
      defaultPrice: s.defaultPrice,
      description: s.description,
    })),
  });

  const createdServices = await tx.serviceTemplate.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, defaultPrice: true, description: true },
  });

  const serviceByRef = new Map<string, (typeof createdServices)[number]>();
  for (const s of template.services) {
    const match = createdServices.find((cs) => cs.name === s.name);
    if (match) serviceByRef.set(s.ref, match);
  }

  for (const p of template.proposals) {
    const clientId = clientIdByRef.get(p.clientRef);
    const service = serviceByRef.get(p.serviceRef);
    if (!clientId || !service) continue;

    const unitPrice = decimalToNumber(service.defaultPrice);
    const subtotal = unitPrice * p.quantity;
    await tx.proposal.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        title: p.title,
        proposalNo: p.proposalNo,
        validUntil: getDateOffset(p.validDays),
        subtotal,
        estimatedTax: subtotal * 0.18,
        totalAmount: subtotal * 1.18,
        status: p.status,
        items: {
          create: [
            {
              serviceTemplateId: service.id,
              title: service.name,
              description: service.description,
              quantity: p.quantity,
              unitPrice,
              total: subtotal,
            },
          ],
        },
      },
    });
  }

  for (let i = 0; i < template.invoices.length; i++) {
    const inv = template.invoices[i];
    const clientId = clientIdByRef.get(inv.clientRef);
    if (!clientId) continue;

    const date = getDateOffset(inv.daysAgo);
    await tx.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        invoiceNumber: `INV-${getFY(date).replace('-', '')}-${String(i + 1).padStart(3, '0')}`,
        financialYear: getFY(date),
        billingMonth: date.toLocaleString('default', { month: 'long', year: 'numeric' }),
        invoiceDate: date,
        clientName: template.clients.find((c) => c.ref === inv.clientRef)?.name ?? 'Client',
        sacCode: template.businessProfile.defaultSacCode ?? '998313',
        serviceDescription: inv.description,
        totalAmount: inv.amount,
        status: inv.status,
        pdfPath: `/demo-invoices/INV-${i + 1}.pdf`,
        amountReceived: inv.status === 'PAID' ? inv.amount : null,
        dateReceived: inv.status === 'PAID' ? getDateOffset(inv.daysAgo + 5) : null,
      },
    });
  }

  await tx.expense.createMany({
    data: template.expenses.map((e) => ({
      workspaceId: workspace.id,
      date: getDateOffset(e.daysAgo),
      category: e.category,
      vendor: e.vendor,
      amount: e.amount,
      description: e.description,
    })),
  });

  await tx.investment.createMany({
    data: template.investments.map((i) => ({
      workspaceId: workspace.id,
      date: getDateOffset(i.daysAgo),
      category: i.category,
      assetName: i.assetName,
      amount: i.amount,
    })),
  });

  for (const r of template.retainers) {
    const clientId = clientIdByRef.get(r.clientRef);
    if (!clientId) continue;
    await tx.retainer.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        serviceName: r.serviceName,
        amount: r.amount,
        frequency: r.frequency,
        autoAppendMonth: r.autoAppendMonth,
        nextBillingDate: getDateOffset(r.nextBillingInDays),
        status: r.status,
        sacCode: r.sacCode,
      },
    });
  }

  // Ensure every optional module is present (caller decides which are enabled via template.modules).
  for (const moduleKey of MODULE_KEYS) {
    const enabled = Boolean(template.modules[moduleKey]);
    await tx.workspaceModule.upsert({
      where: { workspaceId_moduleKey: { workspaceId: workspace.id, moduleKey } },
      update: {
        isEnabled: enabled,
        ...(enabled ? { enabledAt: new Date(), disabledAt: null } : { disabledAt: new Date() }),
      },
      create: {
        workspaceId: workspace.id,
        moduleKey,
        isEnabled: enabled,
        enabledAt: enabled ? new Date() : new Date(),
        disabledAt: enabled ? null : new Date(),
        enabledByUserId: enabled ? params.userId : null,
        disabledByUserId: enabled ? null : params.userId,
      },
    });
  }

  if (template.seed) {
    await template.seed({
      tx,
      workspaceId: workspace.id,
      userId: params.userId,
      now: new Date(),
    });
  }

  return { workspaceId: workspace.id, templateKey: template.key };
}

