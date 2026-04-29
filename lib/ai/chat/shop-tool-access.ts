export type ShopToolName =
  | 'get_shop_summary'
  | 'get_top_shop_products'
  | 'set_shop_status'
  | 'update_shop_announcement'
  | 'open_shop_dashboard';

export type ShopToolAccessInput = {
  moduleEnabled: boolean;
  canView: boolean;
  canViewOrders: boolean;
  canManageSettings: boolean;
  canManageContent: boolean;
};

export function getAllowedShopTools(input: ShopToolAccessInput): ShopToolName[] {
  if (!input.moduleEnabled || !input.canView) return [];
  const tools: ShopToolName[] = [];
  if (input.canViewOrders) {
    tools.push('get_shop_summary', 'get_top_shop_products');
  }
  if (input.canManageSettings) {
    tools.push('set_shop_status');
  }
  if (input.canManageContent) {
    tools.push('update_shop_announcement', 'open_shop_dashboard');
  }
  return tools;
}

export function getShopToolPermissionMap(input: ShopToolAccessInput): Record<ShopToolName, boolean> {
  return {
    get_shop_summary: input.moduleEnabled && input.canView && input.canViewOrders,
    get_top_shop_products: input.moduleEnabled && input.canView && input.canViewOrders,
    set_shop_status: input.moduleEnabled && input.canView && input.canManageSettings,
    update_shop_announcement: input.moduleEnabled && input.canView && input.canManageContent,
    open_shop_dashboard: input.moduleEnabled && input.canView && input.canManageContent,
  };
}
