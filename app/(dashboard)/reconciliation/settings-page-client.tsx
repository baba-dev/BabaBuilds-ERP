"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { Loader2, Landmark, Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Settings = {
  autoMatchMinScore: number;
  autoMatchSuggestionMin: number;
  importRawRetentionDays: number;
  storeRawImportBytes: boolean;
  bankFeedProvider: string;
};

type Rule = {
  id: string;
  priority: number;
  pattern: string;
  matchTxnType: string;
  setCategory: string | null;
  setVendor: string | null;
  setInternalTransfer: boolean;
  isActive: boolean;
};

type BankAcct = { id: string; name: string; plaidLinked?: boolean };

export function ReconciliationSettingsPageClient() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<BankAcct[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [plaidAccountId, setPlaidAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState({
    pattern: "",
    priority: 0,
    matchTxnType: "ANY",
    setCategory: "",
    setVendor: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes, aRes] = await Promise.all([
        fetch("/api/reconcile/settings"),
        fetch("/api/reconcile/rules"),
        fetch("/api/reconcile/bank-accounts"),
      ]);
      const sJson = await sRes.json();
      const rJson = await rRes.json();
      const aJson = await aRes.json();
      if (sRes.ok && sJson.data) setSettings(sJson.data);
      if (rRes.ok && Array.isArray(rJson.data)) setRules(rJson.data);
      if (aRes.ok && Array.isArray(aJson.data)) setAccounts(aJson.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      if (!plaidAccountId) {
        toast.error("Select a bank account first.");
        return;
      }
      const res = await fetch("/api/reconcile/plaid/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken, bankAccountId: plaidAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Exchange failed");
      toast.success("Bank linked with Plaid.");
      void load();
    },
    [plaidAccountId, load],
  );

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      void onPlaidSuccess(public_token);
    },
  });

  const fetchLinkToken = async () => {
    const res = await fetch("/api/reconcile/plaid/link-token", { method: "POST" });
    const data = await res.json();
    if (!data.enabled || !data.linkToken) {
      toast.error(data.message || "Plaid Link is not available.");
      return null;
    }
    return data.linkToken as string;
  };

  const connectPlaid = async () => {
    const token = await fetchLinkToken();
    if (!token) return;
    setLinkToken(token);
  };

  useEffect(() => {
    if (linkToken && plaidReady) openPlaid();
  }, [linkToken, plaidReady, openPlaid]);

  const saveSettings = async () => {
    if (!settings) return;
    const res = await fetch("/api/reconcile/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      toast.error("Could not save settings.");
      return;
    }
    toast.success("Settings saved.");
  };

  const addRule = async () => {
    if (!newRule.pattern.trim()) return;
    const res = await fetch("/api/reconcile/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: newRule.pattern.trim(),
        priority: newRule.priority,
        matchTxnType: newRule.matchTxnType,
        setCategory: newRule.setCategory.trim() || null,
        setVendor: newRule.setVendor.trim() || null,
      }),
    });
    if (!res.ok) {
      toast.error("Could not add rule.");
      return;
    }
    setNewRule({ pattern: "", priority: 0, matchTxnType: "ANY", setCategory: "", setVendor: "" });
    void load();
    toast.success("Rule added.");
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    await fetch(`/api/reconcile/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    void load();
  };

  const syncPlaid = async () => {
    if (!plaidAccountId) {
      toast.error("Select account for sync.");
      return;
    }
    const toastId = toast.loading("Syncing Plaid…");
    try {
      const res = await fetch("/api/reconcile/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankAccountId: plaidAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Imported ${data.imported ?? 0} transactions.`, { id: toastId });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { id: toastId });
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/80 via-zinc-50 to-zinc-50 dark:from-amber-950/30 dark:via-zinc-950 dark:to-zinc-950 p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="text-amber-900 dark:text-amber-200">
            <Link href="/reconciliation" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to center
            </Link>
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            Reconciliation settings
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Matching thresholds, data retention, and automation rules — styled to match your amber workspace theme.
          </p>
        </div>

        <Card className="border-amber-200/80 bg-white/90 shadow-sm dark:border-amber-900/40 dark:bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-950 dark:text-amber-100">
              <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Matching & retention
            </CardTitle>
            <CardDescription>
              Auto-apply invoice matches above the first score; surface suggestions between the two bands.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Auto-match minimum score</Label>
                <Input
                  type="number"
                  value={settings.autoMatchMinScore}
                  onChange={(e) =>
                    setSettings({ ...settings, autoMatchMinScore: Number(e.target.value) })
                  }
                  className="border-amber-200 bg-white dark:border-amber-900/50 dark:bg-zinc-950"
                />
              </div>
              <div className="space-y-2">
                <Label>Suggestion band floor</Label>
                <Input
                  type="number"
                  value={settings.autoMatchSuggestionMin}
                  onChange={(e) =>
                    setSettings({ ...settings, autoMatchSuggestionMin: Number(e.target.value) })
                  }
                  className="border-amber-200 bg-white dark:border-amber-900/50 dark:bg-zinc-950"
                />
              </div>
              <div className="space-y-2">
                <Label>Import raw retention (days)</Label>
                <Input
                  type="number"
                  value={settings.importRawRetentionDays}
                  onChange={(e) =>
                    setSettings({ ...settings, importRawRetentionDays: Number(e.target.value) })
                  }
                  className="border-amber-200 bg-white dark:border-amber-900/50 dark:bg-zinc-950"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="storeRaw"
                  checked={settings.storeRawImportBytes}
                  onChange={(e) =>
                    setSettings({ ...settings, storeRawImportBytes: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <Label htmlFor="storeRaw" className="font-normal">
                  Store raw import files (requires retention &gt; 0)
                </Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bank feed</Label>
              <Select
                value={settings.bankFeedProvider}
                onValueChange={(v) => setSettings({ ...settings, bankFeedProvider: v })}
              >
                <SelectTrigger className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">File import only</SelectItem>
                  <SelectItem value="PLAID">Plaid (US/IN sandbox)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => void saveSettings()}
              className="bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              Save settings
            </Button>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-white/90 shadow-sm dark:border-amber-900/40 dark:bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-950 dark:text-amber-100">
              <Landmark className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Plaid connection
            </CardTitle>
            <CardDescription>
              Requires{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-950">PLAID_CLIENT_ID</code>{" "}
              and{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-950">PLAID_SECRET</code>{" "}
              on the server. Use sandbox for development.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Bank account to attach</Label>
              <Select value={plaidAccountId || undefined} onValueChange={setPlaidAccountId}>
                <SelectTrigger className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950">
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.plaidLinked ? " · linked" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/50"
                onClick={() => void connectPlaid()}
                disabled={settings.bankFeedProvider !== "PLAID"}
              >
                Connect with Plaid
              </Button>
              <Button
                type="button"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => void syncPlaid()}
                disabled={settings.bankFeedProvider !== "PLAID"}
              >
                Sync now
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-white/90 shadow-sm dark:border-amber-900/40 dark:bg-zinc-900/90">
          <CardHeader>
            <CardTitle className="text-amber-950 dark:text-amber-100">Narration rules</CardTitle>
            <CardDescription>
              First matching rule wins (by priority). Use for vendors, internal transfers, or default categories.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Substring in description (case-insensitive)"
                value={newRule.pattern}
                onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950"
              />
              <Input
                type="number"
                placeholder="Priority (lower first)"
                value={newRule.priority}
                onChange={(e) =>
                  setNewRule({ ...newRule, priority: Number(e.target.value) })
                }
                className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950"
              />
              <Select
                value={newRule.matchTxnType}
                onValueChange={(v) => setNewRule({ ...newRule, matchTxnType: v })}
              >
                <SelectTrigger className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any</SelectItem>
                  <SelectItem value="DEBIT">Debit only</SelectItem>
                  <SelectItem value="CREDIT">Credit only</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Set category (optional)"
                value={newRule.setCategory}
                onChange={(e) => setNewRule({ ...newRule, setCategory: e.target.value })}
                className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950"
              />
              <Input
                placeholder="Set vendor (optional)"
                value={newRule.setVendor}
                onChange={(e) => setNewRule({ ...newRule, setVendor: e.target.value })}
                className="border-amber-200 dark:border-amber-900/50 dark:bg-zinc-950 sm:col-span-2"
              />
            </div>
            <Button type="button" onClick={() => void addRule()} className="bg-amber-600 hover:bg-amber-700">
              Add rule
            </Button>

            <div className="divide-y divide-amber-100 rounded-lg border border-amber-100 dark:divide-amber-900/40 dark:border-amber-900/40">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm dark:text-zinc-200"
                >
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    [{r.priority}] {r.pattern}
                  </span>
                  <span className="text-xs text-amber-800 dark:text-amber-300">
                    {r.matchTxnType}
                    {r.setCategory ? ` · ${r.setCategory}` : ""}
                    {r.setVendor ? ` · ${r.setVendor}` : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-amber-800 dark:text-amber-300"
                    onClick={() => void toggleRule(r.id, r.isActive)}
                  >
                    {r.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
              {rules.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-zinc-500">No rules yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
