"use client";

import { useTranslations } from "next-intl";
import { LeavePanel } from "@/components/workforce/hub/LeavePanel";
import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";

export default function WorkforceLeavePage() {
  const t = useTranslations("WorkforceHub");
  return (
    <WorkforcePageShell title={t("nav.leave")} description={t("description")}>
      <LeavePanel />
    </WorkforcePageShell>
  );
}
