/** What the daily shop job should do for one workspace. Pure, so the timing rules are testable without a database. */
export type OrderBrief = { id: string; status: string; createdAt: Date; paidAt: Date | null; shippedAt: Date | null };

const DAY = 86_400_000;

export function planShopMaintenance(orders: OrderBrief[], now = new Date()) {
  const expire = orders.filter((o) => o.status === 'PENDING' && now.getTime() - o.createdAt.getTime() > DAY).map((o) => o.id);
  const unshipped = orders.filter((o) => o.status === 'PAID' && o.paidAt && now.getTime() - o.paidAt.getTime() > 2 * DAY);
  const refundDue = orders.filter((o) => o.status === 'REFUND_DUE');
  const nudges: { key: string; title: string; body: string; actionUrl: string }[] = [];
  const day = now.toISOString().slice(0, 10);
  if (refundDue.length > 0) nudges.push({ key: `refund:${day}`, title: `${refundDue.length} shop order${refundDue.length === 1 ? ' needs' : 's need'} a refund`, body: 'The customer paid but the items sold out. Refund them from your payment gateway, then mark the order refunded.', actionUrl: '/shop' });
  if (unshipped.length > 0 && now.getUTCDay() !== 0 && now.getUTCDay() !== 6) nudges.push({ key: `ship:${day}`, title: `${unshipped.length} paid order${unshipped.length === 1 ? ' is' : 's are'} waiting to ship`, body: 'These orders were paid more than two days ago and have not shipped yet.', actionUrl: '/shop' });
  return { expire, nudges };
}
