import type { AccountingEventType, AccountingLineSide } from '@prisma/client';

export type LedgerPostingTemplateLine = {
  accountCode: string;
  side: AccountingLineSide;
  description: string;
};

export type LedgerPostingTemplate = {
  eventType: AccountingEventType;
  postingPolicy: {
    timestamp: 'EVENT_TIME' | 'CAPTURE_TIME' | 'SETTLEMENT_TIME';
    currency: 'TRANSACTION_CURRENCY' | 'WORKSPACE_BASE_CURRENCY';
  };
  lines: [LedgerPostingTemplateLine, LedgerPostingTemplateLine, ...LedgerPostingTemplateLine[]];
};

export const MONEY_EVENT_LEDGER_MAP: LedgerPostingTemplate[] = [
  {
    eventType: 'INVOICE_CREATED',
    postingPolicy: { timestamp: 'EVENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '1100_AR', side: 'DEBIT', description: 'Accounts receivable increases on invoice issue' },
      { accountCode: '4000_REVENUE', side: 'CREDIT', description: 'Recognize revenue for invoice principal' },
    ],
  },
  {
    eventType: 'PAYMENT_CAPTURED',
    postingPolicy: { timestamp: 'CAPTURE_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '1000_CASH', side: 'DEBIT', description: 'Cash/bank increases after settlement' },
      { accountCode: '1100_AR', side: 'CREDIT', description: 'Receivable cleared against payment' },
    ],
  },
  {
    eventType: 'REFUND_ISSUED',
    postingPolicy: { timestamp: 'SETTLEMENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '4090_SALES_RETURNS', side: 'DEBIT', description: 'Reverse recognized revenue for refunded amount' },
      { accountCode: '1000_CASH', side: 'CREDIT', description: 'Cash outflow for refund' },
    ],
  },
  {
    eventType: 'CREDIT_NOTE_ISSUED',
    postingPolicy: { timestamp: 'EVENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '4095_CREDIT_NOTES', side: 'DEBIT', description: 'Revenue reduction via credit note' },
      { accountCode: '1100_AR', side: 'CREDIT', description: 'Reduce customer receivable balance' },
    ],
  },
  {
    eventType: 'CHARGEBACK_RECORDED',
    postingPolicy: { timestamp: 'SETTLEMENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '6150_CHARGEBACK_LOSS', side: 'DEBIT', description: 'Recognize processor dispute loss' },
      { accountCode: '1000_CASH', side: 'CREDIT', description: 'Cash removed by processor chargeback' },
    ],
  },
  {
    eventType: 'FX_CONVERSION_RECORDED',
    postingPolicy: { timestamp: 'EVENT_TIME', currency: 'WORKSPACE_BASE_CURRENCY' },
    lines: [
      { accountCode: '1001_FX_HOLDING', side: 'DEBIT', description: 'Destination currency wallet increase' },
      { accountCode: '1000_CASH', side: 'CREDIT', description: 'Source currency wallet decrease' },
    ],
  },
  {
    eventType: 'WRITE_OFF_RECORDED',
    postingPolicy: { timestamp: 'EVENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '6120_BAD_DEBT', side: 'DEBIT', description: 'Recognize uncollectible receivable' },
      { accountCode: '1100_AR', side: 'CREDIT', description: 'Derecognize stale receivable' },
    ],
  },
  {
    eventType: 'MANUAL_ADJUSTMENT',
    postingPolicy: { timestamp: 'EVENT_TIME', currency: 'TRANSACTION_CURRENCY' },
    lines: [
      { accountCode: '9990_SUSPENSE', side: 'DEBIT', description: 'Manual correction (debit leg)' },
      { accountCode: '9991_SUSPENSE_OFFSET', side: 'CREDIT', description: 'Manual correction (credit leg)' },
    ],
  },
];

export function getPostingTemplate(eventType: AccountingEventType): LedgerPostingTemplate | undefined {
  return MONEY_EVENT_LEDGER_MAP.find((template) => template.eventType === eventType);
}
