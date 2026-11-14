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
  const [aiAnalyze, setAiAnalyze] = useState(false);
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
        fd.set("aiAnalyze", String(aiAnalyze));

        setProgress(25);
        const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
        setProgress(75);

        const body = (await res.json().catch(() => null)) as { error?: string; details?: { message?: string } } | null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
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
          "relative overflow-hidden rounded-xl border-2 border-dashed bg-card/50 p-16 transition-all duration-300 ease-out hover:bg-card hover:shadow-md group",
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10"
            : "border-muted-foreground/25 hover:border-primary/50",
        )}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        )}
        <div className="relative flex flex-col items-center justify-center gap-4 text-center z-10">
          <div className={cn(
            "rounded-full p-4 transition-colors duration-300 ring-4",
            isDragging 
              ? "bg-primary text-primary-foreground ring-primary/20" 
              : "bg-muted text-muted-foreground ring-transparent group-hover:bg-primary/10 group-hover:text-primary group-hover:ring-primary/5"
          )}>
            <UploadCloud className={cn("h-8 w-8 transition-transform duration-300", isDragging && "scale-110")} />
          </div>
          
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              {isDragging ? "Drop your file here" : "Drag & drop to upload"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
              Support for PDFs, PNG/JPG/JPEG/WEBP, CSV, XLSX. Policy is enforced server-side.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <input
                type="checkbox"
                id="ai-analyze"
                checked={aiAnalyze}
                onChange={(e) => setAiAnalyze(e.target.checked)}
                className="rounded border-zinc-300 text-primary focus:ring-primary h-4 w-4"
              />
              <label htmlFor="ai-analyze" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                Analyze with AI Agent (Requires Groq Key)
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-4">
            {meterState?.label && (
              <Badge variant={meterState.variant} className="uppercase tracking-wide text-[11px] shadow-sm">
                {meterState.label}
              </Badge>
            )}
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
              size="default"
              className="font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
              onClick={() => {
                void refreshQuota();
                document.getElementById("doc-upload")?.click();
              }}
              disabled={isUploading}
            >
              {isUploading ? "Uploading…" : "Browse files"}
            </Button>
          </div>
        </div>
        
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-md border-t z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-foreground">Uploading document...</span>
              <span className="text-muted-foreground font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
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

