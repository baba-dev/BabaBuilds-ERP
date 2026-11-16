"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AttendanceSheet } from "@/components/workforce/hub/AttendanceSheet";
import { CheckInCard } from "@/components/workforce/hub/CheckInCard";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";

export default function WorkforceAttendancePage() {
  const t = useTranslations("WorkforceHub");
  const [tick, setTick] = useState(0);
  return (
    <WorkforcePageShell title={t("nav.attendance")} description={t("description")}>
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CheckInCard onChanged={() => setTick((n) => n + 1)} />
        <AttendanceSheet refreshKey={tick} />
      </div>
    </WorkforcePageShell>
  );
}
