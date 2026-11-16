"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LinkedDoc = {
  id: string;
  relation: string;
  document: {
    id: string;
    title: string;
    category: string;
    status: string;
    isArchived: boolean;
    createdAt: string;
    files: Array<{
      storedPath: string;
      mimeType: string;
      byteSize: number;
      originalName: string;
    }>;
  };
};

export function LinkedDocumentsPanel({
  targetType,
  targetId,
  className,
  compact = false,
}: {
  targetType: string;
  targetId: string;
  className?: string;
  compact?: boolean;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [links, setLinks] = useState<LinkedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/documents/links?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`, {
          cache: "no-store",
        });
        const body = (await res.json().catch(() => null)) as { error?: string; links?: unknown } | null;
        if (!res.ok) {
          if (!cancelled) setError(body?.error || "Failed to load linked documents.");
          return;
        }
        if (!cancelled) setLinks(Array.isArray(body?.links) ? (body.links as LinkedDoc[]) : []);
      } catch {
        if (!cancelled) setError("Failed to load linked documents.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [targetId, targetType]);

  const content = useMemo(() => {
    if (isLoading) {
      return <div className="text-sm text-muted-foreground">Loading…</div>;
    }
    if (error) {
      return <div className="text-sm text-muted-foreground">{error}</div>;
    }
    if (links.length === 0) {
      return (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">No linked documents.</div>
          <Button asChild size="sm" variant="outline">
            <Link href="/documents">Upload</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className={cn("space-y-2", compact && "space-y-1.5")}>
        {links.map((l) => {
          const f = l.document.files[0];
          return (
            <div
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-foreground/10 bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold text-foreground">{l.document.title}</div>
                  <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
                    {l.relation}
                  </Badge>
                  {l.document.isArchived ? (
                    <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                      Archived
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {l.document.category} · {l.document.status}
                  {f?.mimeType ? ` · ${f.mimeType}` : ""}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {f?.storedPath ? (
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                    <a href={f.storedPath} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline" className="h-8 px-2">
                  <Link href={`/documents/vault?doc=${encodeURIComponent(l.document.id)}`}>Open</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [compact, error, isLoading, links]);

  return (
    <Card className={cn("border-foreground/10", className)} size={compact ? "sm" : "default"}>
      <CardHeader className={cn(compact ? "py-3" : "py-4")}>
        <CardTitle className="text-sm font-semibold">Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{content}</CardContent>
    </Card>
  );
}

