/**
 * Notification System — Types
 * All event names, payload shapes, and channel options are defined here.
 */

export type NotificationEventType =
  | 'INVOICE_GENERATED'
  | 'INVOICE_PAID'
  | 'PAYMENT_REMINDER'
  | 'CLIENT_ADDED'
  | 'PROPOSAL_CREATED'
  | 'SERVICE_CREATED'
  | 'RENEWAL_ALERT'
  | 'BILLING_FAILED'
  | 'DEADLINE_ALERT'
  | 'TAX_ALERT'
  | 'SHOP_ORDER_CREATED'
  | 'SHOP_ORDER_UPDATED'
  | 'SHOP_ORDER_DELETED'
  | 'SHOP_ORDER_STATUS_CHANGED';

export interface NotificationPayload {
  event: NotificationEventType;
  /** Workspace context — used to look up SMTP & push subscriptions */
  workspaceId: string;
  /**
   * The primary user(s) to notify.
   * Dispatcher fans out to ALL workspace members (OWNERs) by default.
   * Pass explicit `userIds` to restrict the audience.
   */
  userIds?: string[];
  /** Per-event data used to populate templates */
  data: Record<string, unknown>;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link URL opened when the user taps the notification */
  url: string;
  /** Optional image for rich Android notifications */
  image?: string;
  /** Badge count / vibrate etc. handled in sw.ts */
  tag?: string;
}
