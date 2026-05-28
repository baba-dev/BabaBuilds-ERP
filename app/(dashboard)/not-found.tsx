import Link from "next/link";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <DashboardPageShell
      title="Page not found"
      description="This workspace route does not exist or you may not have access."
      animated={false}
      maxWidthClassName="max-w-xl"
      primaryAction={
        <Button asChild>
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Check the URL or use the sidebar to navigate to an available module.
      </p>
    </DashboardPageShell>
  );
}
