export type ShopDashboardLoadPlan = {
  fetchOrders: boolean;
  fetchProducts: boolean;
  fetchSettings: boolean;
};

/**
 * Centralized fetch-plan policy for Shop dashboard data loading.
 * Prevents accidental order/revenue fetches when caller lacks `shop.orders.view`.
 */
export function getShopDashboardLoadPlan(canViewOrders: boolean): ShopDashboardLoadPlan {
  return {
    fetchOrders: canViewOrders,
    fetchProducts: true,
    fetchSettings: true,
  };
}

