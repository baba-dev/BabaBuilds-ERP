#!/usr/bin/env node
/**
 * Seeds a realistic hosted-email business into an EXISTING workspace of a DISPOSABLE local database, in accrual billing
 * mode, so the Email Hosting screens can be reviewed with believable data and a staging check can be walked through by hand.
 *
 *   # 1. a disposable PostgreSQL named bababuilds_erp_ci on localhost with the migrations applied
 *   # 2. a workspace to fill (for example from the demo sign-in: POST /api/auth/demo)
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci \
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/email-hosting-staging-seed.ts --workspace=<workspaceId>
 *
 * It refuses to run against anything but localhost / bababuilds_erp_ci. It makes real invoices through the real invoice
 * engine for two clients, and prints what each statement should show so the screens can be checked against it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { setupDomainBilling } from '@/lib/email-billing/setup';
import { buildStatement, collectFromClient, markCollectedThrough } from '@/lib/email-billing/collections';
import { runEmailHostingDailyForWorkspace } from '@/lib/email-billing/daily-run';

function assertDisposable() {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && decodeURIComponent(u.pathname.slice(1)) === 'bababuilds_erp_ci') return;
  } catch { /* fall through */ }
  console.error('Refusing to run: this seed only works on a disposable local database named bababuilds_erp_ci.');
  process.exit(1);
}

const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
const ago = (days: number) => new Date(today.getTime() - days * DAY);
const day = (d: Date) => d.toISOString().slice(0, 10);

// Small deterministic generator so every run produces the same business.
let seed = 20261118;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

type Box = { local: string; used?: number; admin?: boolean; suspended?: boolean; removedDaysAgo?: number };
type Spec = { client: string | null; email?: string; domain: string; issuedDaysAgo: number; boxes: Box[] };

const names = ['ann', 'bob', 'cara', 'dev', 'esha', 'farid', 'gita', 'hari', 'isha', 'john', 'kavya', 'liam', 'maya', 'nikhil', 'om'];
const boxes = (n: number, extra: Partial<Record<number, Partial<Box>>> = {}): Box[] => Array.from({ length: n }, (_, i) => ({ local: names[i % names.length] + (i >= names.length ? String(i) : ''), used: Math.round(200 + rnd() * 6500), ...extra[i] }));

const SPECS: Spec[] = [
  { client: 'Acme Traders', email: 'accounts@acme-traders.example', domain: 'acme-traders.in', issuedDaysAgo: 420, boxes: boxes(8, { 0: { local: 'accounts', used: 2100 }, 3: { used: 9600 } }) },
  { client: 'Acme Traders', email: 'accounts@acme-traders.example', domain: 'acme-exports.com', issuedDaysAgo: 200, boxes: boxes(3) },
  { client: 'Bluebird Logistics', email: 'finance@bluebird.example', domain: 'bluebirdlogistics.com', issuedDaysAgo: 380, boxes: boxes(12, { 1: { used: 9900 }, 4: { used: 9450 }, 7: { suspended: true }, 10: { removedDaysAgo: 40 } }) },
  { client: 'Chandra Textiles', email: 'office@chandra.example', domain: 'chandratextiles.in', issuedDaysAgo: 150, boxes: boxes(5) },
  { client: 'Delta Dental Clinic', email: 'frontdesk@deltadental.example', domain: 'deltadental.in', issuedDaysAgo: 95, boxes: boxes(4) },
  { client: 'Evergreen School', email: 'admin@evergreen.example', domain: 'evergreenschool.org', issuedDaysAgo: 300, boxes: boxes(15, { 2: { used: 9800 }, 5: { used: 9700 }, 9: { used: 9300 } }) },
  { client: 'Fusion Cafe', domain: 'fusioncafe.in', issuedDaysAgo: 40, boxes: boxes(2) },
  { client: 'Gupta & Sons CA', email: 'ca@gupta.example', domain: 'guptaca.in', issuedDaysAgo: 500, boxes: boxes(6, { 0: { local: 'admin', admin: true } }) },
  { client: 'Harbor Freight Agents', domain: 'harborfa.com', issuedDaysAgo: 25, boxes: boxes(3) },
  { client: 'Indus Interiors', email: 'studio@indus.example', domain: 'indusinteriors.in', issuedDaysAgo: 10, boxes: boxes(2) },
  { client: 'Jade Boutique', domain: 'jadeboutique.in', issuedDaysAgo: 3, boxes: boxes(1) },
  { client: 'Kiran Pharma', email: 'accounts@kiran.example', domain: 'kiranpharma.com', issuedDaysAgo: 220, boxes: boxes(9, { 6: { used: 9500 } }) },
  // Served but not billed yet: no customer / no plan, so they show up as "needs setup".
  { client: null, domain: 'lotusyoga.in', issuedDaysAgo: 60, boxes: boxes(2) },
  { client: null, domain: 'mystery-shop.in', issuedDaysAgo: 15, boxes: boxes(2) },
];

async function main() {
  assertDisposable();
  const arg = process.argv.find((a) => a.startsWith('--workspace='));
  const workspaceId = arg?.split('=')[1];
  if (!workspaceId) { console.error('Usage: --workspace=<workspaceId>'); process.exit(1); }
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, name: true, baseCurrency: true, businessProfile: { select: { id: true } } } });
  if (!workspace) { console.error(`Workspace ${workspaceId} not found.`); process.exit(1); }
  if (!workspace.businessProfile) { console.error('This workspace has no business profile, so it cannot create invoices. Use a demo workspace or complete the profile first.'); process.exit(1); }
  process.env.PRIVATE_UPLOADS_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'erp-staging-seed-'));
  const owner = await prisma.workspaceUser.findFirst({ where: { workspaceId, role: 'OWNER' }, select: { userId: true } });
  const actor = owner?.userId ?? null;

  await prisma.workspaceModule.upsert({
    where: { workspaceId_moduleKey: { workspaceId, moduleKey: 'MIAB_BILLING' } },
    create: { workspaceId, moduleKey: 'MIAB_BILLING', isEnabled: true }, update: { isEnabled: true },
  });
  const server = await prisma.mailBillingServer.upsert({
    where: { workspaceId_name: { workspaceId, name: 'aiwamail-mx1' } },
    create: { workspaceId, name: 'aiwamail-mx1', baseUrl: 'https://box.aiwamail.example', accessMode: 'MANAGED_API', writesEnabled: true, miabVersion: 'v70', lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS' },
    update: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', writesEnabled: true, miabVersion: 'v70' },
  });
  await prisma.mailBillingSyncRun.create({ data: { workspaceId, serverId: server.id, status: 'SUCCESS', finishedAt: new Date(), domainsSeen: SPECS.length, mailboxesSeen: SPECS.reduce((n, s) => n + s.boxes.length, 0) } });
  const plan = await prisma.mailBillingPlan.upsert({
    where: { workspaceId_name: { workspaceId, name: 'Mailbox 10 GB' } },
    create: { workspaceId, name: 'Mailbox 10 GB', description: 'Per email address per month', billingMode: 'PER_MAILBOX', basePrice: 100, currency: workspace.baseCurrency || 'INR', frequency: 'MONTHLY', includedQuotaMb: 10240, outboundPerDay: 200 },
    update: {},
  });
  await prisma.mailBillingSettings.upsert({
    where: { workspaceId }, create: { workspaceId, billingModel: 'ACCRUAL', defaultPlanId: plan.id, allowMailboxManagement: true, quotaAlertPercent: 90 },
    update: { billingModel: 'ACCRUAL', defaultPlanId: plan.id, allowMailboxManagement: true, quotaAlertPercent: 90 },
  });

  const clientIds = new Map<string, string>();
  const domainIds = new Map<string, string>();
  for (const spec of SPECS) {
    const issued = ago(spec.issuedDaysAgo);
    if (spec.client && !clientIds.has(spec.client)) {
      const existing = await prisma.client.findFirst({ where: { workspaceId, name: spec.client }, select: { id: true } });
      const client = existing ?? await prisma.client.create({ data: { workspaceId, name: spec.client, address: 'Pune, Maharashtra', country: 'India', countryCode: 'IN', gstStateCode: '27', isExport: false, email: spec.email ?? null, source: 'IMPORT' } });
      clientIds.set(spec.client, client.id);
    }
    const domain = await prisma.mailBillingDomain.upsert({
      where: { workspaceId_serverId_domain: { workspaceId, serverId: server.id, domain: spec.domain } },
      create: { workspaceId, serverId: server.id, domain: spec.domain, mailboxCount: spec.boxes.filter((b) => !b.removedDaysAgo).length, aliasCount: Math.floor(rnd() * 3), discoveredAt: issued },
      update: {},
    });
    domainIds.set(spec.domain, domain.id);
    for (const box of spec.boxes) {
      const email = `${box.local}@${spec.domain}`;
      await prisma.mailBillingMailbox.upsert({
        where: { workspaceId_serverId_email: { workspaceId, serverId: server.id, email } },
        create: {
          workspaceId, serverId: server.id, domainId: domain.id, email, localPart: box.local, quotaMb: 10240, usedMb: box.used ?? 0, usageCheckedAt: new Date(), isAdmin: box.admin ?? false,
          status: box.removedDaysAgo ? 'REMOVED' : 'ACTIVE', archivedAt: box.removedDaysAgo ? ago(box.removedDaysAgo) : null, suspendedAt: box.suspended ? ago(12) : null, suspendedReason: box.suspended ? 'Unpaid invoice' : null,
          billingStartsOn: issued,
        },
        update: {},
      });
    }
  }

  // Bring the billed domains into accrual billing the way a real user would (issue date = billing start).
  for (const spec of SPECS.filter((s) => s.client)) {
    await setupDomainBilling({ workspaceId, userId: actor, domainId: domainIds.get(spec.domain)!, planId: plan.id, clientId: clientIds.get(spec.client!)!, startDate: ago(spec.issuedDaysAgo) });
  }
  // A customer who paid up to six months ago outside the ERP.
  await markCollectedThrough({ workspaceId, userId: actor ?? 'seed', scope: { clientId: clientIds.get('Gupta & Sons CA')! }, date: ago(180) });

  // Two real collections: one paid in cash, one still unpaid, so history, unpaid invoices and "last collected" have content.
  const collectNow = actor ?? 'seed';
  const acme = await collectFromClient({ workspaceId, userId: collectNow, clientId: clientIds.get('Acme Traders')!, asOf: ago(60), now: ago(60), payment: { method: 'CASH', reference: 'Receipt 0001' } });
  const delta = await collectFromClient({ workspaceId, userId: collectNow, clientId: clientIds.get('Delta Dental Clinic')!, asOf: ago(30), now: ago(30) });

  await runEmailHostingDailyForWorkspace(workspaceId, new Date());

  console.log(`\nSeeded "${workspace.name}" (${workspaceId}) in accrual mode.\n`);
  console.log(`Collections made: Acme Traders ${acme.invoice?.invoiceNumber} (paid, up to ${day(ago(60))}), Delta Dental Clinic ${delta.invoice?.invoiceNumber} (unpaid, up to ${day(ago(30))}).`);
  console.log('\nWhat each statement should show today (verify these by hand: 100 per address per month, charged per day):');
  for (const [name, id] of clientIds) {
    const s = await buildStatement(workspaceId, id, today);
    const total = s.currencies.reduce((n, c) => n + c.total, 0);
    console.log(`  ${name.padEnd(24)} ${String(total.toFixed(2)).padStart(10)}  (${s.currencies.reduce((n, c) => n + c.addresses, 0)} addresses)`);
  }
  console.log('\nNot billed on purpose (should appear under "needs setup"): lotusyoga.in, mystery-shop.in');
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
