import { WorkforcePageShell } from "@/components/workforce/WorkforceLayout";
import { BarChart3, TrendingUp, Users2, CalendarDays } from "lucide-react";

export default function WorkforceReportsPage() {
  return (
    <WorkforcePageShell
      title="Workforce Reports"
      description="Analytics and insights for your team's performance and attendance."
    >
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
          <BarChart3 className="h-8 w-8 text-indigo-400" />
        </div>
        <h2 className="text-lg font-bold text-zinc-200">Reports Coming Soon</h2>
        <p className="text-sm text-zinc-500 text-center max-w-sm">
          Workforce analytics, attendance trends, leave utilization, and headcount reports are being built.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-4">
          {[
            { icon: Users2, label: "Headcount Trends" },
            { icon: TrendingUp, label: "Attendance Analytics" },
            { icon: CalendarDays, label: "Leave Utilization" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/50 px-4 py-2">
              <Icon className="h-3.5 w-3.5 text-zinc-500" />
              <span className="text-xs text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </WorkforcePageShell>
  );
}
