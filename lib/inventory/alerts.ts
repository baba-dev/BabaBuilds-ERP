/** Which stock nudges are due today. Pure, so the timing rules are testable without a database. */
export type InventoryAlert = { key: string; title: string; body: string; actionUrl: string };

const DAY = 86_400_000;
const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

const list = (names: string[], max = 4) => (names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);

export function planInventoryAlerts(args: {
  now: Date;
  outOfStock: string[];
  lowStock: string[];
  urgentReorder: number;
  overdueOrders: { poNumber: string; supplier: string; expectedDate: Date }[];
}): InventoryAlert[] {
  const out: InventoryAlert[] = [];
  const { now } = args;
  const dow = now.getUTCDay(); // 1 = Monday, 4 = Thursday
  const day = now.toISOString().slice(0, 10);

  if (args.outOfStock.length > 0 && (dow === 1 || dow === 4)) {
    out.push({ key: `out:${day}`, title: `${args.outOfStock.length} item${args.outOfStock.length === 1 ? ' is' : 's are'} out of stock`, body: `${list(args.outOfStock)} cannot be sold until restocked.`, actionUrl: '/inventory?tab=reorder' });
  }
  if (args.lowStock.length > 0 && dow === 1) {
    out.push({ key: `low:${day}`, title: `${args.lowStock.length} item${args.lowStock.length === 1 ? ' is' : 's are'} running low`, body: `${list(args.lowStock)} ${args.lowStock.length === 1 ? 'is' : 'are'} at or below the safety level.${args.urgentReorder ? ` ${args.urgentReorder} should be reordered now.` : ''}`, actionUrl: '/inventory?tab=reorder' });
  }
  for (const o of args.overdueOrders) {
    const late = Math.round((startOfDay(now) - startOfDay(o.expectedDate)) / DAY);
    if (late === 1 || late === 7 || (late > 7 && late % 7 === 0)) {
      out.push({ key: `po:${o.poNumber}:${late}`, title: `${o.poNumber} is ${late} day${late === 1 ? '' : 's'} late`, body: `${o.supplier} was due to deliver on ${o.expectedDate.toISOString().slice(0, 10)}. Follow up or update the order.`, actionUrl: '/inventory?tab=orders' });
    }
  }
  return out;
}
