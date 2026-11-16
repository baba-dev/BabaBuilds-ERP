import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/mailer';
import { loadReceipt } from '@/lib/pos/receipt-load';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { posErrorResponse, readJson, requirePos } from '../../../_guard';

const body = z.object({ to: z.string().trim().email().max(120) });

/** Emails the receipt PDF to the customer, from the business's own mail settings. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePos('checkout');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/pos/receipts/email', scope: workspaceId, max: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const { id } = await ctx.params;
    const d = body.parse(await readJson(req));

    const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
    if (!profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) {
      return NextResponse.json({ code: 'SMTP_NOT_CONFIGURED', error: 'Email is not set up yet. Add your mail settings in Business Settings.' }, { status: 400 });
    }
    const r = await loadReceipt(workspaceId, id);
    if (!r) return NextResponse.json({ code: 'NOT_FOUND', error: 'Receipt not found.' }, { status: 404 });

    // The mailer attaches files from disk, so the PDF is written to a private temp file for the send and removed after.
    const tmp = path.join(os.tmpdir(), `receipt-${crypto.randomUUID()}.pdf`);
    await fs.promises.writeFile(tmp, r.bytes, { mode: 0o600 });
    try {
      await sendEmail({
        route: 'user', profile, to: d.to,
        subject: `Your receipt ${r.invoice.invoiceNumber} from ${r.companyName}`,
        text: `Thank you for your purchase from ${r.companyName}. Your receipt ${r.invoice.invoiceNumber} is attached.`,
        html: `<p>Thank you for your purchase from <strong>${r.companyName.replace(/</g, '&lt;')}</strong>.</p><p>Your receipt <strong>${r.invoice.invoiceNumber}</strong> is attached.</p>`,
        attachments: [{ filename: `${r.invoice.invoiceNumber.replace(/[^\w.-]/g, '_')}-receipt.pdf`, path: tmp, contentType: 'application/pdf' }],
      });
    } catch (error) {
      console.error('[pos/receipt-email]', error);
      return NextResponse.json({ code: 'SEND_FAILED', error: 'The email could not be sent. Check your mail settings.' }, { status: 502 });
    } finally {
      await fs.promises.unlink(tmp).catch(() => undefined);
    }
    void logActivity({ workspaceId, action: 'pos.receipt_emailed', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'invoice', id }, metadata: { number: r.invoice.invoiceNumber } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return posErrorResponse(e, 'receipt.email');
  }
}
