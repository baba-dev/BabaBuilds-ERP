import { Prisma, InvoiceStatus } from '@prisma/client';
import { createPrismaClient } from '../lib/prisma-client';

const prisma = createPrismaClient();

type SeedOptions = {
  invoices: number;
  shopOrders: number;
  products: number;
  clients: number;
  workspaceName: string;
};

const DEFAULTS: SeedOptions = {
  invoices: 10_000,
  shopOrders: 5_000,
  products: 2_000,
  clients: 300,
  workspaceName: "Scale Test Workspace",
};

function pick<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function daysAgo(n: number, now: Date) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

function fyFromDate(d: Date) {
  // FY is Apr 1 -> Mar 31; formatted as "YY-YY"
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-based
  const fyStartYear = month >= 3 ? year : year - 1;
  const a = String(fyStartYear).slice(-2);
  const b = String(fyStartYear + 1).slice(-2);
  return `${a}-${b}`;
}

function billingMonthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function main() {
  const opts: SeedOptions = {
    invoices: Number(process.env.SEED_INVOICES ?? DEFAULTS.invoices),
    shopOrders: Number(process.env.SEED_SHOP_ORDERS ?? DEFAULTS.shopOrders),
    products: Number(process.env.SEED_PRODUCTS ?? DEFAULTS.products),
    clients: Number(process.env.SEED_CLIENTS ?? DEFAULTS.clients),
    workspaceName: process.env.SEED_WORKSPACE_NAME ?? DEFAULTS.workspaceName,
  };

  const now = new Date();
  const rand = rng(42);

  console.log("Seeding realistic scale data", opts);

  // Ensure at least one workspace + owner user exists.
  const ownerEmail = "scale-owner@local.test";
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { name: "Scale Owner" },
    create: { email: ownerEmail, name: "Scale Owner" },
  });

  const existingWorkspace = await prisma.workspace.findFirst({
    where: { name: opts.workspaceName },
    select: { id: true },
  });

  const workspace = existingWorkspace
    ? await prisma.workspace.update({
        where: { id: existingWorkspace.id },
        data: {
          isSetupComplete: true,
          subscriptionStatus: "PRO",
          planTier: "PRO",
          countryCode: "IN",
          baseCurrency: "INR",
          users: {
            connectOrCreate: {
              where: { userId_workspaceId: { userId: user.id, workspaceId: existingWorkspace.id } },
              create: { userId: user.id, role: "OWNER" },
            },
          },
          businessProfile: {
            upsert: {
              create: {
                companyName: "Scale Test Co",
                proprietorName: "Scale Owner",
                address: "1 Scale Street",
                email: ownerEmail,
                phone: "0000000000",
                panNumber: "ABCDE1234F",
                bankName: "Test Bank",
                accountName: "Scale Test Co",
                accountNumber: "000000000000",
                ifscCode: "TEST0000001",
              },
              update: {
                companyName: "Scale Test Co",
                proprietorName: "Scale Owner",
                address: "1 Scale Street",
                email: ownerEmail,
                phone: "0000000000",
              },
            },
          },
        },
      })
    : await prisma.workspace.create({
        data: {
          name: opts.workspaceName,
          isSetupComplete: true,
          subscriptionStatus: "PRO",
          planTier: "PRO",
          countryCode: "IN",
          baseCurrency: "INR",
          users: {
            create: { userId: user.id, role: "OWNER" },
          },
          businessProfile: {
            create: {
              companyName: "Scale Test Co",
              proprietorName: "Scale Owner",
              address: "1 Scale Street",
              email: ownerEmail,
              phone: "0000000000",
              panNumber: "ABCDE1234F",
              bankName: "Test Bank",
              accountName: "Scale Test Co",
              accountNumber: "000000000000",
              ifscCode: "TEST0000001",
            },
          },
        },
      });

  const workspaceId = workspace.id;
  console.log("Workspace", workspaceId);

  // Create a NextAuth demo-login compatible user for easy local testing.
  // Credentials provider only accepts emails ending with @bababuilds.demo.
  const demoEmail = "scale_demo@bababuilds.demo";
  const demoPassword = "scale-demo-token";
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { name: "Scale Demo User" },
    create: { email: demoEmail, name: "Scale Demo User", role: "DEMO" },
  });
  await prisma.workspaceUser.upsert({
    where: { userId_workspaceId: { userId: demoUser.id, workspaceId } },
    update: { role: "OWNER" },
    create: { userId: demoUser.id, workspaceId, role: "OWNER" },
  });
  await prisma.verificationToken.upsert({
    where: { identifier_token: { identifier: demoEmail, token: demoPassword } },
    update: { expires: new Date(Date.now() + 1000 * 60 * 60) },
    create: { identifier: demoEmail, token: demoPassword, expires: new Date(Date.now() + 1000 * 60 * 60) },
  });

  // Clients
  const clientRows: Array<Prisma.ClientCreateManyInput> = [];
  for (let i = 0; i < opts.clients; i++) {
    clientRows.push({
      workspaceId,
      name: `Client ${String(i + 1).padStart(4, "0")}`,
      address: `${i + 1} Client Road`,
      country: pick(["IN", "US", "GB", "AE"], i),
      email: `client${i + 1}@local.test`,
      phone: `900000${String(i).padStart(4, "0")}`,
      status: "ACTIVE",
      isExport: true,
    });
  }
  // NOTE: In Prisma's generated types, `skipDuplicates` may be `never` for some SQLite schemas.
  // Keep the seed idempotent by swallowing unique constraint errors.
  await prisma.client
    .createMany({ data: clientRows })
    .catch((err) => {
      if (err?.code === "P2002") return;
      throw err;
    });
  const clients = await prisma.client.findMany({ where: { workspaceId }, select: { id: true, name: true } });

  // Products
  // Products: use upsert per SKU to keep this seed idempotent and avoid Decimal parsing quirks in createMany.
  for (let i = 0; i < opts.products; i++) {
    const safetyStock = 5 + Math.floor(rand() * 15);
    const currentStock = Math.max(0, Math.floor(rand() * 120) - 10);
    const status =
      currentStock === 0 ? "OUT_OF_STOCK" : currentStock <= safetyStock ? "LOW_STOCK" : "IN_STOCK";
    const sku = `SKU-${String(i + 1).padStart(6, "0")}`;
    const baselinePrice = (50 + rand() * 950).toFixed(2);
    const costPrice = (25 + rand() * 700).toFixed(2);

    await prisma.product.upsert({
      where: { sku_workspaceId: { sku, workspaceId } },
      update: {
        name: `Product ${String(i + 1).padStart(5, "0")}`,
        category: pick(["GOODS", "ELECTRONICS", "CONSUMABLE"], i),
        unit: "pcs",
        baselinePrice,
        costPrice,
        currentStock,
        safetyStock,
        status,
        barcode: `BC${String(10_000_000 + i)}`,
        location: pick(["Warehouse A", "Warehouse B", "Van 1", "Van 2"], i),
      },
      create: {
        workspaceId,
        sku,
        name: `Product ${String(i + 1).padStart(5, "0")}`,
        category: pick(["GOODS", "ELECTRONICS", "CONSUMABLE"], i),
        unit: "pcs",
        baselinePrice,
        costPrice,
        currentStock,
        safetyStock,
        status,
        barcode: `BC${String(10_000_000 + i)}`,
        location: pick(["Warehouse A", "Warehouse B", "Van 1", "Van 2"], i),
      },
    });
  }

  // Invoices
  // Spread across last ~24 months to simulate real history; statuses mixed.
  const invoiceRows: Array<Prisma.InvoiceCreateManyInput> = [];
  const statuses: InvoiceStatus[] = ["PENDING", "PARTIALLY_PAID", "PAID"];
  for (let i = 0; i < opts.invoices; i++) {
    const ageDays = Math.floor(rand() * 720); // last 2 years
    const invoiceDate = daysAgo(ageDays, now);
    const fy = fyFromDate(invoiceDate);
    const client = pick(clients, i);
    const billed = 500 + rand() * 95_000;
    const status = pick(statuses, Math.floor(rand() * 1000));
    const amountReceived =
      status === "PAID"
        ? billed
        : status === "PARTIALLY_PAID"
          ? Math.max(0, billed * (0.1 + rand() * 0.7))
          : 0;
    const invoiceNumber = String(i + 1).padStart(6, "0");

    invoiceRows.push({
      workspaceId,
      invoiceNumber,
      financialYear: fy,
      billingMonth: billingMonthLabel(invoiceDate),
      invoiceDate,
      clientName: client.name,
      serviceDescription: "Services rendered",
      subtotal: billed.toFixed(2),
      taxRate: 0,
      taxAmount: "0",
      grandTotal: billed.toFixed(2),
      totalAmount: billed.toFixed(2),
      pdfPath: `/invoices/${workspaceId}/seed-${invoiceNumber}.pdf`,
      status,
      amountReceived: amountReceived.toFixed(2),
      dateReceived: status === "PAID" ? invoiceDate : null,
      clientId: client.id,
    });
  }
  // Create in chunks to avoid huge single statement.
  const chunkSize = 500;
  for (let i = 0; i < invoiceRows.length; i += chunkSize) {
    const chunk = invoiceRows.slice(i, i + chunkSize);
    await prisma.invoice.createMany({ data: chunk });
    if (i % 2000 === 0) console.log(`Invoices seeded: ${Math.min(i + chunk.length, invoiceRows.length)}`);
  }

  // Shop orders (public shop orders / transactions stand-in)
  const orderRows: Array<Prisma.ShopOrderCreateManyInput> = [];
  const orderStatuses = ["PENDING", "PAID", "FAILED"] as const;
  for (let i = 0; i < opts.shopOrders; i++) {
    const ageDays = Math.floor(rand() * 365);
    const createdAt = daysAgo(ageDays, now);
    const amount = 200 + rand() * 40_000;
    orderRows.push({
      workspaceId,
      buyerName: `Buyer ${i + 1}`,
      buyerEmail: `buyer${i + 1}@local.test`,
      subtotal: amount.toFixed(2),
      taxTotal: "0",
      amount: amount.toFixed(2),
      currency: "INR",
      status: pick([...orderStatuses], i),
      createdAt,
      updatedAt: createdAt,
    });
  }

  for (let i = 0; i < orderRows.length; i += chunkSize) {
    const chunk = orderRows.slice(i, i + chunkSize);
    await prisma.shopOrder.createMany({ data: chunk });
    if (i % 2000 === 0) console.log(`Shop orders seeded: ${Math.min(i + chunk.length, orderRows.length)}`);
  }

  console.log("✅ Scale seed complete.");
  console.log(`Login with demo auth user: ${demoEmail} / ${demoPassword}`);
  console.log(`Workspace name: ${opts.workspaceName}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

