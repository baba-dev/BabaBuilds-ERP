import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import type { DashboardData } from "./types";

export function DashboardActivityFeed({ activity }: { activity: DashboardData["activity"] }) {
  return (
    <Card className="p-4 border-zinc-200 dark:border-zinc-800">
      <p className="text-sm font-semibold">Recent activity</p>
      <div className="mt-3 space-y-2">
        {activity.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent activity yet.</p>
        ) : (
          activity.slice(0, 6).map((item) => (
            <div key={item.id} className="rounded-md border border-zinc-200 dark:border-zinc-800 p-2.5">
              <p className="text-sm font-medium">{item.action}</p>
              <p className="text-xs text-zinc-500">{item.status} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
