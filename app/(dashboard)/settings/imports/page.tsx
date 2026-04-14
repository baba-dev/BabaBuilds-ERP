"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, UploadCloud, WandSparkles } from "lucide-react";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";

type BankImportItem = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  aiCategory?: string;
  aiVendor?: string;
  reason?: string;
};

export default function ImportsSettingsPage() {
  const { fCurrency } = useFormat();
  const [isUploading, setIsUploading] = useState(false);
  const [autoPlaced, setAutoPlaced] = useState<BankImportItem[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState<BankImportItem[]>([]);
  const [selected, setSelected] = useState<BankImportItem | null>(null);
  const [reviewDraft, setReviewDraft] = useState({ aiCategory: "", aiVendor: "" });

  const totals = useMemo(() => {
    const all = [...autoPlaced, ...needsConfirmation];
    return {
      debit: all.filter((row) => row.type === "DEBIT").reduce((sum, row) => sum + row.amount, 0),
      credit: all.filter((row) => row.type === "CREDIT").reduce((sum, row) => sum + row.amount, 0),
    };
  }, [autoPlaced, needsConfirmation]);

  const openReview = (item: BankImportItem) => {
    setSelected(item);
    setReviewDraft({
      aiCategory: item.aiCategory ?? "General",
      aiVendor: item.aiVendor ?? "",
    });
  };

  const applyReview = () => {
    if (!selected) return;
    const updated = {
      ...selected,
      aiCategory: reviewDraft.aiCategory || "General",
      aiVendor: reviewDraft.aiVendor || "Unassigned",
    };
    setNeedsConfirmation((prev) => prev.map((item) => (item.id === selected.id ? updated : item)));
    setSelected(null);
    toast.success("Classification updated. You can now approve this row.");
  };

  const approveRow = (id: string) => {
    setNeedsConfirmation((prev) => {
      const item = prev.find((entry) => entry.id === id);
      if (!item) return prev;
      setAutoPlaced((current) => [item, ...current]);
      return prev.filter((entry) => entry.id !== id);
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const body = new FormData();
    body.append("file", file);

    setIsUploading(true);
    try {
      const response = await fetch("/api/reconcile/upload", { method: "POST", body });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to import statement");
      }

      const autoMatched = Array.isArray(payload.autoMatched) ? payload.autoMatched : [];
      const aiSuggestions = Array.isArray(payload.aiSuggestions) ? payload.aiSuggestions : [];
      setAutoPlaced(autoMatched);
      setNeedsConfirmation(aiSuggestions);
      toast.success("Statement imported. AI has prefilled matching transactions.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <DashboardPageShell
      title="Bank Imports"
      description="Upload bank statements and let AI place debit and credit rows into your ledger workflow."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 animate-in fade-in slide-in-from-left-2 duration-500">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">AI Import Flow</Badge>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              Bank statement ingestion
            </CardTitle>
            <CardDescription>
              Credits and debits are auto-detected. High-confidence rows are placed automatically. Others open a confirmation step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 bg-zinc-50/70 dark:bg-zinc-900/40">
              <Label htmlFor="statement-upload">Upload CSV, XLSX, or PDF statement</Label>
              <Input id="statement-upload" type="file" className="mt-2" onChange={handleUpload} />
              <div className="mt-3 flex items-center text-xs text-zinc-500 gap-2">
                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
                {isUploading ? "Processing rows with reconciliation AI..." : "Your file is processed through the same AI matching pipeline used in reconciliation."}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40">
                <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Credits detected</p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{fCurrency(totals.credit)}</p>
              </div>
              <div className="rounded-xl border p-3 bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40">
                <p className="text-xs uppercase tracking-wider text-rose-700 dark:text-rose-300">Debits detected</p>
                <p className="text-lg font-semibold text-rose-700 dark:text-rose-300">{fCurrency(totals.debit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-in fade-in slide-in-from-right-2 duration-700">
          <CardHeader>
            <CardTitle>Import status</CardTitle>
            <CardDescription>Live summary of AI placement confidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>Auto-placed</span>
              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">{autoPlaced.length}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span>Needs confirmation</span>
              <Badge variant="secondary">{needsConfirmation.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5 animate-in fade-in duration-700">
        <CardHeader>
          <CardTitle>Rows requiring confirmation</CardTitle>
          <CardDescription>
            Review AI-suggested category/vendor before approving into the same downstream bookkeeping flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {needsConfirmation.length === 0 ? (
            <p className="text-sm text-zinc-500">No confirmations needed right now.</p>
          ) : (
            needsConfirmation.map((row) => (
              <div key={row.id} className="rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{row.description}</p>
                  <p className="text-xs text-zinc-500">{row.date} · {row.type} · {fCurrency(row.amount)}</p>
                  {row.reason ? <p className="text-xs text-amber-600 mt-1">{row.reason}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openReview(row)}>
                    <WandSparkles className="h-4 w-4 mr-1" /> Review
                  </Button>
                  <Button size="sm" onClick={() => approveRow(row.id)}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm AI classification</DialogTitle>
            <DialogDescription>
              Adjust vendor/category if needed before approving this transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-zinc-50 dark:bg-zinc-900 p-3 text-sm">
              <p className="font-medium">{selected?.description}</p>
              <p className="text-zinc-500 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {selected?.type} · {selected ? fCurrency(selected.amount) : ""}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={reviewDraft.aiCategory} onValueChange={(value) => setReviewDraft((prev) => ({ ...prev, aiCategory: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Office">Office</SelectItem>
                  <SelectItem value="Travel">Travel</SelectItem>
                  <SelectItem value="Sales Receipt">Sales Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendor / Source</Label>
              <Input
                value={reviewDraft.aiVendor}
                onChange={(event) => setReviewDraft((prev) => ({ ...prev, aiVendor: event.target.value }))}
                placeholder="Acme Supplies"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={applyReview}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
