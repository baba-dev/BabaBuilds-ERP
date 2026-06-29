"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";

type DocType = {
  id: string;
  title: string;
  category: string;
  scope: string;
  status: string;
  aiSummary: string | null;
  aiMeta: any;
  files: {
    mimeType: string;
    byteSize: number;
    storedPath: string;
  }[];
  links: any[];
};

export function UnifiedDocumentList({ documents }: { documents: DocType[] }) {
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200/50 bg-white/50 p-12 text-center shadow-sm backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/50">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="rounded-full bg-zinc-100 p-4 text-zinc-400 dark:bg-zinc-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No documents found. Start by uploading one above.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`px-3 py-1 h-8 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm dark:bg-zinc-700' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            Grid
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={`px-3 py-1 h-8 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm dark:bg-zinc-700' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4 mr-2" />
            List
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        <Card className="overflow-hidden border-zinc-200/50 bg-white/50 shadow-sm backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-zinc-50/30 dark:bg-zinc-900/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-6 h-10 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Document</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-zinc-500 uppercase tracking-wider">AI Summary & Meta</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</TableHead>
                  <TableHead className="h-10 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => {
                  const current = d.files[0];
                  return (
                    <TableRow key={d.id} className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 group">
                      <TableCell className="px-6 py-4 align-top">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-zinc-900 group-hover:text-primary dark:text-zinc-100 transition-colors">
                            {d.title}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            <span className="uppercase tracking-wider">{current?.mimeType ? current.mimeType.split('/').pop() : "—"}</span>
                            {current?.storedPath && (
                              <>
                                <span>•</span>
                                <a
                                  className="text-primary hover:underline underline-offset-2 flex items-center gap-0.5"
                                  href={current.storedPath}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 align-top max-w-xs">
                        {d.aiSummary ? (
                          <div className="space-y-2">
                            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-2" title={d.aiSummary}>
                              {d.aiSummary}
                            </p>
                            {d.aiMeta && Object.keys(d.aiMeta).length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(d.aiMeta).slice(0, 3).map(([k, v]) => (
                                  <Badge key={k} variant="secondary" className="text-[9px] px-1.5 py-0 uppercase bg-primary/10 text-primary hover:bg-primary/20">
                                    {k}: {String(v).substring(0, 15)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">No AI analysis</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4 align-top">
                        <Badge variant={d.status === "FAILED" ? "destructive" : d.status === "INBOX" ? "secondary" : "default"} className="capitalize text-[10px] tracking-wide shadow-sm">
                          {d.status.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 align-top text-xs font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">
                        {current ? `${Math.ceil(current.byteSize / 1024)} KB` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((d) => {
            const current = d.files[0];
            return (
              <Card key={d.id} className="group overflow-hidden border-zinc-200/50 bg-white/50 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30 dark:border-zinc-800/50 dark:bg-zinc-900/50">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                      {d.title}
                    </h3>
                    <Badge variant={d.status === "FAILED" ? "destructive" : d.status === "INBOX" ? "secondary" : "default"} className="capitalize text-[9px] tracking-wide shrink-0">
                      {d.status.toLowerCase()}
                    </Badge>
                  </div>
                  
                  {d.aiSummary && (
                    <div className="mb-4 flex-1">
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed line-clamp-3">
                        {d.aiSummary}
                      </p>
                    </div>
                  )}

                  {d.aiMeta && Object.keys(d.aiMeta).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4 mt-auto">
                      {Object.entries(d.aiMeta).slice(0, 4).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/5 text-primary/80 border-primary/10">
                          {k}: {String(v).substring(0, 15)}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] font-medium text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <span className="uppercase">{current?.mimeType ? current.mimeType.split('/').pop() : "—"}</span>
                      <span>•</span>
                      <span>{current ? `${Math.ceil(current.byteSize / 1024)} KB` : "—"}</span>
                    </div>
                    {current?.storedPath && (
                      <a
                        className="text-primary hover:underline underline-offset-2"
                        href={current.storedPath}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View File
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
