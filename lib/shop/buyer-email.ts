import 'server-only';
import { sendEmail } from '@/lib/mailer';
import { prisma } from '@/lib/prisma';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number, cur: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(n);

type Kind = 'PAID' | 'SHIPPED' | 'REFUNDED' | 'REFUND_DUE';

/**
 * Tells the buyer what happened to their order, from the shop's own mail settings. Never throws: a mail problem must not
 * undo a payment. Returns whether an email went out.
 */
export async function emailBuyer(orderId: string, kind: Kind): Promise<boolean> {
  try {
    const order = await prisma.shopOrder.findUnique({ where: { id: orderId }, include: { items: true, workspace: { include: { businessProfile: true } } } });
    const profile = order?.workspace.businessProfile;
    if (!order || !profile || !profile.smtpHost || !profile.smtpUser || !profile.smtpPassword) return false;
    const shop = profile.companyName;
    const total = money(Number(order.amount), order.currency);
    const lines = order.items.map((i) => `<li>${esc(i.productName)} × ${i.quantity}</li>`).join('');
    const track = order.trackingRef ? `<p>Courier: <strong>${esc(order.courier || 'Courier')}</strong><br/>Tracking: <strong>${esc(order.trackingRef)}</strong></p>` : '';
    const copy: Record<Kind, { subject: string; body: string }> = {
      PAID: { subject: `Order received from ${shop}`, body: `<p>Thank you, ${esc(order.buyerName)}. We have received your payment of <strong>${total}</strong>.</p><ul>${lines}</ul><p>We will let you know when it ships.</p>` },
      SHIPPED: { subject: `Your order from ${shop} is on its way`, body: `<p>Good news, ${esc(order.buyerName)}: your order has shipped.</p><ul>${lines}</ul>${track}` },
      REFUNDED: { subject: `Your refund from ${shop}`, body: `<p>Hello ${esc(order.buyerName)}, your order of <strong>${total}</strong> has been refunded. It can take a few working days to reach your account.</p>` },
      REFUND_DUE: { subject: `About your order from ${shop}`, body: `<p>Hello ${esc(order.buyerName)}, we received your payment of <strong>${total}</strong> but some items sold out before we could confirm the order. We are sorry: you will be refunded in full.</p>` },
    };
    const c = copy[kind];
    await sendEmail({ route: 'user', profile, to: order.buyerEmail, subject: c.subject, html: `${c.body}<p>${esc(shop)}</p>`, text: c.body.replace(/<[^>]+>/g, ' ') });
    return true;
  } catch (e) {
    console.error('[shop/buyer-email]', e);
    return false;
  }
}
