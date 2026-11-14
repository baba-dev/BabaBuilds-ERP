"use client";

import { useEffect, useMemo, useState } from "react";
import { Paperclip, Search, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LinkedDocumentsPanel } from "@/components/documents/LinkedDocumentsPanel";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DocumentRow = {
  id: string;
  title: string;
  category: string;
  scope: string;
  status: string;
  isArchived: boolean;
  createdAt: string;
  files: Array<{ mimeType: string; byteSize: number; storedPath: string; originalName: string }>;
};

export function RecordDocumentsDialog({
  targetType,
  targetId,
  className,
}: {
  targetType: string;
  targetId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);

  const [q, setQ] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DocumentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch("/api/workspace/modules", { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { modules?: string[] } | null;
        const enabled = Boolean(body?.modules?.includes("DOCUMENTS"));
        if (!cancelled) setModuleEnabled(enabled);
      } catch {
        if (!cancelled) setModuleEnabled(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const doSearch = async () => {
    setIsSearching(true);
    try {
      const url = `/api/documents/list?q=${encodeURIComponent(q)}&archived=0`;
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { error?: string; documents?: unknown } | null;
      if (!res.ok) {
        toast.error(body?.error || "Failed to search documents.");
        setResults([]);
        return;
      }
      const docs = Array.isArray(body?.documents) ? (body.documents as DocumentRow[]) : [];
      setResults(docs);
    } finally {
      setIsSearching(false);
    }
  };

  const linkDoc = async (documentId: string) => {
    const res = await fetch("/api/documents/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, targetType, targetId, relation: "ATTACHMENT" }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      toast.error(body?.error || "Failed to link document.");
      return;
    }
    toast.success("Document linked.");
    // refresh linked panel by re-opening (LinkedDocumentsPanel fetches on mount)
    setOpen(false);
    setTimeout(() => setOpen(true), 50);
  };

  const trigger = useMemo(() => {
    if (moduleEnabled !== true) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("w-9 px-0 flex justify-center", className)}
        onClick={() => setOpen(true)}
        title="Documents"
      >
        <Paperclip className="h-3.5 w-3.5" />
      </Button>
    );
  }, [className, moduleEnabled]);

  if (moduleEnabled !== true) return null;

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documents</DialogTitle>
            <DialogDescription>Linked documents and quick attach from the Vault.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <LinkedDocumentsPanel targetType={targetType} targetId={targetId} compact />

            <div className="rounded-xl border border-foreground/10 bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-muted-foreground" />
                Attach existing document
                <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                  Vault
                </Badge>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by title/category…"
                  className="h-9"
                />
                <Button size="sm" variant="secondary" onClick={() => void doSearch()} disabled={isSearching}>
                  {isSearching ? "Searching…" : "Search"}
                </Button>
              </div>

              {results.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {results.slice(0, 8).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-card px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{d.title}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {d.category} · {d.status}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => void linkDoc(d.id)}>
                        <Link2 className="mr-2 h-3.5 w-3.5" />
                        Link
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

