import { allowedDays } from "@/lib/msme/payables";
import { isMicroOrSmall } from "@/lib/msme/udyam";

const DAY = 86_400_000;
export const DEFAULT_TERMS_DAYS = 30;

export type BillLike = { date: Date; dueDate?: Date | null; vendorMsme?: string | null; vendorAgreedDays?: number | null; vendorTermsDays?: number | null };

/**
 * When an unpaid bill has to be paid: the due date on the bill, else the legal limit for a micro or small supplier
 * (agreed days, at most 45, 15 with no agreement), else the vendor's terms, else 30 days.
 */
export function billDueDate(b: BillLike): Date {
  if (b.dueDate) return b.dueDate;
  if (isMicroOrSmall(b.vendorMsme)) return new Date(b.date.getTime() + allowedDays(b.vendorAgreedDays) * DAY);
  return new Date(b.date.getTime() + (b.vendorTermsDays && b.vendorTermsDays > 0 ? b.vendorTermsDays : DEFAULT_TERMS_DAYS) * DAY);
}

export type AgingBucket = "NOT_DUE" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS";
export function agingBucket(due: Date, now: Date): AgingBucket {
  const late = Math.floor((now.getTime() - due.getTime()) / DAY);
  if (late <= 0) return "NOT_DUE";
  if (late <= 30) return "D1_30";
  if (late <= 60) return "D31_60";
  if (late <= 90) return "D61_90";
  return "D90_PLUS";
}
