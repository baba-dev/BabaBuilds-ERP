import { z } from "zod";
import { MAX_CATEGORY_LENGTH } from "./categories";
import { FREQUENCIES } from "./recurrence";
import { MAX_AMOUNT } from "./validate";

export const recurringSchema = z.object({
  vendor: z.string().trim().min(1, "REQUIRED").max(120, "TOO_LONG"),
  vendorId: z.string().nullish(),
  category: z.string().trim().min(1, "REQUIRED").max(MAX_CATEGORY_LENGTH, "TOO_LONG"),
  amount: z.number({ error: "AMOUNT" }).positive("AMOUNT").max(MAX_AMOUNT, "AMOUNT"),
  description: z.string().trim().max(500, "TOO_LONG").nullish(),
  frequency: z.enum(FREQUENCIES as [string, ...string[]]),
  nextRunDate: z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "DATE"),
  endDate: z.string().nullish().refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "DATE"),
  autoPost: z.boolean().default(false),
  paymentStatus: z.enum(["PAID", "UNPAID"]).default("PAID"),
  dueInDays: z.number().int().min(0).max(365).nullish(),
  itcStatus: z.enum(["NONE", "ELIGIBLE", "INELIGIBLE", "REVERSE_CHARGE"]).default("NONE"),
  gstRate: z.number().min(0).max(100).nullish(),
});
export type RecurringInput = z.infer<typeof recurringSchema>;
