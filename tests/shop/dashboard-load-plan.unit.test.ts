import { describe, it, expect } from 'vitest';
import { getShopDashboardLoadPlan } from '@/app/(dashboard)/shop/load-plan';

describe('shop dashboard load plan', () => {
  it('fetches orders only when canViewOrders is true', () => {
    expect(getShopDashboardLoadPlan(true).fetchOrders).toBe(true);
    expect(getShopDashboardLoadPlan(false).fetchOrders).toBe(false);
  });

  it('always fetches products + settings for all shop viewers', () => {
    expect(getShopDashboardLoadPlan(true).fetchProducts).toBe(true);
    expect(getShopDashboardLoadPlan(true).fetchSettings).toBe(true);
    expect(getShopDashboardLoadPlan(false).fetchProducts).toBe(true);
    expect(getShopDashboardLoadPlan(false).fetchSettings).toBe(true);
  });
});
