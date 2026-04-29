import { describe, expect, it } from 'vitest';
import {
  getAllowedShopTools,
  getShopToolPermissionMap,
} from '@/lib/ai/chat/shop-tool-access';

describe('shop chatbot tool access', () => {
  it('does not expose any shop tools when module is disabled', () => {
    const tools = getAllowedShopTools({
      moduleEnabled: false,
      canView: true,
      canViewOrders: true,
      canManageSettings: true,
      canManageContent: true,
    });
    expect(tools).toEqual([]);
  });

  it('does not expose any shop tools when user lacks shop.view', () => {
    const tools = getAllowedShopTools({
      moduleEnabled: true,
      canView: false,
      canViewOrders: true,
      canManageSettings: true,
      canManageContent: true,
    });
    expect(tools).toEqual([]);
  });

  it('does not expose get_shop_summary with shop.view only', () => {
    const tools = getAllowedShopTools({
      moduleEnabled: true,
      canView: true,
      canViewOrders: false,
      canManageSettings: false,
      canManageContent: false,
    });
    expect(tools).not.toContain('get_shop_summary');
  });

  it('exposes order tools when shop.orders.view is granted', () => {
    const tools = getAllowedShopTools({
      moduleEnabled: true,
      canView: true,
      canViewOrders: true,
      canManageSettings: false,
      canManageContent: false,
    });
    expect(tools).toContain('get_shop_summary');
    expect(tools).toContain('get_top_shop_products');
  });

  it('permission map requires shop.orders.view for get_shop_summary', () => {
    const map = getShopToolPermissionMap({
      moduleEnabled: true,
      canView: true,
      canViewOrders: false,
      canManageSettings: true,
      canManageContent: true,
    });
    expect(map.get_shop_summary).toBe(false);
    expect(map.get_top_shop_products).toBe(false);
    expect(map.set_shop_status).toBe(true);
    expect(map.update_shop_announcement).toBe(true);
  });
});
