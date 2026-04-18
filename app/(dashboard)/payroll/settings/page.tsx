import { SlidersHorizontal } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { PayrollSettingsStudio } from "@/components/payroll/PayrollSettingsStudio";

export default function PayrollSettingsPage() {
  return (
    <DashboardPageShell
      title="Payroll Configuration"
      description="Govern pay structures, statutory registers, payout cadence, and workforce linkage in one structured studio."
      icon={<SlidersHorizontal className="h-5 w-5 text-cyan-500" />}
    >
      <PayrollSettingsStudio />
    </DashboardPageShell>
  );
}
