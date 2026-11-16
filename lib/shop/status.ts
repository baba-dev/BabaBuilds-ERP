/** The life of a shop order, and which moves are allowed. Pure, so the rules are easy to test. */
export const SHOP_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'FULFILLED', 'FAILED', 'REFUND_DUE', 'REFUNDED'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

/** Orders that count as sales: paid and not refunded. */
export const REVENUE_STATUSES: ShopStatus[] = ['PAID', 'SHIPPED', 'FULFILLED'];

/** Orders where the customer's money has been received. */
export const PAID_STATUSES: ShopStatus[] = ['PAID', 'SHIPPED', 'FULFILLED', 'REFUND_DUE'];

const MOVES: Record<ShopStatus, ShopStatus[]> = {
  PENDING: ['PAID', 'FAILED'],
  PAID: ['SHIPPED', 'FULFILLED', 'REFUNDED'],
  SHIPPED: ['FULFILLED', 'REFUNDED'],
  FULFILLED: ['REFUNDED'],
  FAILED: ['PAID'],
  REFUND_DUE: ['REFUNDED'],
  REFUNDED: [],
};

export function isShopStatus(v: string): v is ShopStatus {
  return (SHOP_STATUSES as readonly string[]).includes(v);
}

export function canMove(from: string, to: ShopStatus): boolean {
  return isShopStatus(from) && MOVES[from].includes(to);
}

/** Only orders that never took money can be removed; anything paid is refunded instead, so the books keep the trail. */
export function canDelete(status: string): boolean {
  return status === 'PENDING' || status === 'FAILED';
}

/** Orders waiting on the shop owner: paid and not yet shipped, or paid and cannot be fulfilled. */
export function needsAction(status: string): boolean {
  return status === 'PAID' || status === 'REFUND_DUE';
}
