"use client";

import Link from "next/link";
import { ArrowRight, Rocket, ShoppingBag, Sparkles } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ShopSettingsPage() {
  return (
    <DashboardPageShell
      title="Storefront Settings"
      description="Prepare and launch your public shop once services are ready."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Card className="animate-in fade-in slide-in-from-left-3 duration-500">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">Launch Checklist</Badge>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-indigo-500" />
              Validate storefront readiness
            </CardTitle>
            <CardDescription>
              Confirm service visibility, payments, and copy before publishing your store.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
            <p>• At least one service is visible in shop.</p>
            <p>• Payment gateway is configured.</p>
            <p>• Shop branding and accent color are set.</p>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in slide-in-from-right-3 duration-700">
          <CardHeader>
            <Badge className="w-fit bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">Go Live</Badge>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-emerald-500" />
              Open Shop Control Center
            </CardTitle>
            <CardDescription>
              Use the Shop dashboard to publish services, manage orders, and monitor conversion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="gap-2">
              <Link href="/shop">
                <Sparkles className="h-4 w-4" />
                Open shop dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  );
}
