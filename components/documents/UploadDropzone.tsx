"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type QuotaResponse = {
  bytesUsedTotal: number;
  bytesCapTotal: number | null;
  percentUsedTotal: number;
  threshold: "OK" | "WARN_70" | "WARN_90" | "FULL" | "UNLIMITED";
  planTier: string;
};

type UploadResult = {
  documentId: string;
  fileId: string;
  storedPath: string;
  title: string;
  byteSize: number;
  mimeType: string;
};

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const fixed = i === 0 ? 0 : 1;
  return `${v.toFixed(fixed)} ${units[i]}`;
}

export function UploadDropzone({
  className,
  onUploaded,
}: {
  className?: string;
  onUploaded?: (result: UploadResult) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quota, setQuota] = useState<QuotaResponse | null>(null);

  const refreshQuota = useCallback(async () => {
    const res = await fetch("/api/documents/quota", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as QuotaResponse;
    setQuota(data);
    return data;
  }, []);

  const meterState = useMemo(() => {
    if (!quota) return null;
    if (quota.threshold === "FULL") return { variant: "destructive" as const, label: "Storage full" };
    if (quota.threshold === "WARN_90") return { variant: "destructive" as const, label: "Near limit" };
    if (quota.threshold === "WARN_70") return { variant: "secondary" as const, label: "Approaching limit" };
    return { variant: "outline" as const, label: "" };
  }, [quota]);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setProgress(10);
      try {
        const q = (await refreshQuota()) ?? quota;
        if (q?.threshold === "FULL") {
          toast.error("Storage is full for this workspace. Please upgrade or archive/manage documents.");
          return;
        }

        const fd = new FormData();
        fd.set("file", file);
        fd.set("category", "GENERAL");
        fd.set("scope", "WORKSPACE_BUSINESS");

        setProgress(25);
        const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
        setProgress(75);

        const body = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          const msg =
            body?.details?.message || body?.error || "Upload failed. Please check the file type/size and storage limits.";
          toast.error(msg);
          await refreshQuota();
          return;
        }

        const result = body as UploadResult;
        toast.success("Document uploaded to Inbox.");
        onUploaded?.(result);
        await refreshQuota();
      } finally {
        setProgress(100);
        setTimeout(() => setProgress(0), 300);
        setIsUploading(false);
      }
    },
    [onUploaded, quota, refreshQuota],
  );

  const onDrop = useCallback(
    (ev: React.DragEvent<HTMLDivElement>) => {
      ev.preventDefault();
      ev.stopPropagation();
      setIsDragging(false);
      const file = ev.dataTransfer.files?.[0];
      if (file) void handleUpload(file);
    },
    [handleUpload],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border bg-card p-4 transition-colors",
          isDragging ? "border-primary/50 bg-primary/5" : "border-foreground/10",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-medium">Drop to upload</div>
              {meterState?.label ? (
                <Badge variant={meterState.variant} className="uppercase tracking-wide text-[10px]">
                  {meterState.label}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              PDFs, PNG/JPG/JPEG/WEBP, CSV, XLSX. Policy is enforced server-side.
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <input
              id="doc-upload"
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.currentTarget.value = "";
              }}
              disabled={isUploading}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void refreshQuota();
                document.getElementById("doc-upload")?.click();
              }}
              disabled={isUploading}
            >
              {isUploading ? "Uploading…" : "Choose file"}
            </Button>
          </div>
        </div>
        {progress > 0 ? (
          <div className="mt-3">
            <Progress value={progress} />
          </div>
        ) : null}
      </div>

      {quota ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="truncate">
            Used: <span className="text-foreground/80">{formatBytes(quota.bytesUsedTotal)}</span>
          </div>
          <div className="shrink-0">
            Cap: <span className="text-foreground/80">{quota.bytesCapTotal === null ? "Unlimited" : formatBytes(quota.bytesCapTotal)}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void refreshQuota()}>
            Load storage status
          </Button>
        </div>
      )}
    </div>
  );
}

