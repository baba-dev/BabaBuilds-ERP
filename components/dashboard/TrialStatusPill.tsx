"use client";

import Link from "next/link";
import { differenceInCalendarDays, startOfDay } from "date-fns";

type TrialStatusPillProps = {
  trialEndsAt: string | null;
  isTrialing: boolean;
};

export default function TrialStatusPill({ trialEndsAt, isTrialing }: TrialStatusPillProps) {
  if (!isTrialing || !trialEndsAt) return null;

  const daysLeft = differenceInCalendarDays(startOfDay(new Date(trialEndsAt)), startOfDay(new Date()));
  const label =
    daysLeft <= 0
      ? "Trial ended"
      : daysLeft === 1
        ? "1 day left in trial"
        : `${daysLeft} days left in trial`;

  return (
    <Link
      href="/settings/billing"
      className="inline-flex items-center rounded-full border border-orange-500/35 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-800 transition hover:bg-orange-500/15 dark:text-orange-200"
    >
      {label}
    </Link>
  );
}
