"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/documents/UploadDropzone";
import { StorageMeter } from "@/components/documents/StorageMeter";
import { useEffect, useState } from "react";

export default function DocumentsInboxPage() {
  const [quota, setQuota] = useState<{
    enabled: boolean;
    bytesUsedTotal: number;
    bytesCapTotal: number | null;
    percentUsedTotal: number;
    threshold: string;
    planTier: string;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/documents/quota", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuota(d));
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            Upload Center
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Drag &amp; drop intake with strict policy, OCR queueing, and record linking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/documents"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Overview
          </Link>
          <Link
            href="/documents/vault"
            className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Vault
          </Link>
        </div>
      </div>

      <Card className="border-zinc-200/70 dark:border-zinc-800" size="sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-bold">Workspace storage</CardTitle>
            <Link
              href="/documents/settings"
              className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Settings
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {quota?.bytesCapTotal ? (
            <StorageMeter usedBytes={quota.bytesUsedTotal} capBytes={quota.bytesCapTotal} compact />
          ) : (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
        </CardContent>
      </Card>

      <UploadDropzone />
    </div>
  );
}

