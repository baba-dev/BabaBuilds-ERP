import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, Sparkles, Terminal, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireSystemHealthSuperAdmin } from "../_auth";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export default async function ErrorDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSystemHealthSuperAdmin();

  const { id: errorId } = await params;
  const errorLog = await prisma.systemErrorLog.findUnique({
    where: { id: errorId },
    include: { remediation: true }
  });

  if (!errorLog) {
    notFound();
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      
      {/* Navigation */}
      <Link href="/admin/system-health" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Error Stream
      </Link>
      
      {/* Header */}
      <div className="flex items-start justify-between pb-6 border-b">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400">
              {errorLog.errorType}
            </h1>
            <Badge variant={errorLog.status === "RESOLVED" ? "default" : "destructive"}>
              {errorLog.status}
            </Badge>
          </div>
          <p className="text-foreground">{errorLog.message}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Occurred: {format(new Date(errorLog.createdAt), "PP pp")}</span>
            {errorLog.route && <span>Route: {errorLog.route}</span>}
          </div>
        </div>
      </div>

      {/* AI Analysis Section */}
      {errorLog.aiDiagnosis ? (
        <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 p-6 shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles className="w-24 h-24" />
          </div>
          
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-lg pb-2 border-b border-blue-200/50">
              <Sparkles className="w-5 h-5" />
              AI Diagnostics
              {errorLog.aiConfidence && (
                <span className="text-xs bg-blue-200/50 dark:bg-blue-800/50 px-2 py-1 rounded-full ml-2">
                  {errorLog.aiConfidence}% Confidence
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-200">Root Cause</h4>
              <p className="text-blue-800 dark:text-blue-100 text-sm leading-relaxed">
                {errorLog.aiDiagnosis}
              </p>
            </div>

            {errorLog.remediation ? (
              <div className="mt-6 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 shadow-sm overflow-hidden">
                <div className="bg-emerald-50 dark:bg-emerald-950/50 px-4 py-3 border-b border-emerald-100 dark:border-emerald-900 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">
                      Proposed Remediation: {errorLog.remediation.actionType}
                    </span>
                  </div>
                  <Badge variant={
                    errorLog.remediation.status === "SUCCESS" ? "default" :
                    errorLog.remediation.status === "FAILED" ? "destructive" :
                    "secondary"
                  }>
                    {errorLog.remediation.status}
                  </Badge>
                </div>
                
                <div className="p-4 space-y-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {errorLog.remediation.description}
                  </p>
                  
                  <div className="bg-slate-950 rounded-md p-4 overflow-x-auto">
                    <pre className="text-emerald-400 text-xs font-mono whitespace-pre-wrap">
                      {errorLog.remediation.content}
                    </pre>
                  </div>
                  
                  {errorLog.remediation.status === "PENDING_APPROVAL" && (
                    <div className="flex justify-end pt-2">
                      <Button disabled variant="outline">
                        Offline signature required
                      </Button>
                    </div>
                  )}

                  {errorLog.remediation.executionLog && (
                    <div className="mt-4 border-t pt-4">
                      <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">Execution Log</h5>
                      <div className="bg-slate-900 rounded p-3 text-xs font-mono text-slate-400 max-h-40 overflow-y-auto">
                        <pre className="whitespace-pre-wrap">{errorLog.remediation.executionLog}</pre>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : errorLog.aiSuggestedFix && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-200">Suggested Fix</h4>
                <div className="bg-slate-900 rounded-md p-4 overflow-x-auto">
                  <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
                    {errorLog.aiSuggestedFix}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-muted/50 p-6 border text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-medium text-lg">No AI Diagnostics Available</h3>
          <p className="text-sm text-muted-foreground">
            {errorLog.status === "ANALYZING" ? "The AI is currently analyzing this error. Please refresh in a moment." : "This error was not processed by the AI analyzer."}
          </p>
          <Button disabled variant="outline" className="mt-2">Super-admin analysis required</Button>
        </div>
      )}

      {/* User Communication */}
      {errorLog.aiUserFriendlyMessage && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/20 overflow-hidden shadow-sm">
          <div className="bg-blue-100/50 dark:bg-blue-900/30 px-4 py-3 border-b border-blue-200/50 dark:border-blue-800/50 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-sm text-blue-900 dark:text-blue-300">What the user saw:</span>
          </div>
          <div className="p-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">
              "{errorLog.aiUserFriendlyMessage}"
            </p>
          </div>
        </div>
      )}

      {/* Request Context (Metadata) */}
      {errorLog.metadata && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="bg-muted px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-sm">Request Context / Metadata</span>
            </div>
            {errorLog.environment && (
              <Badge variant="outline" className="text-xs">
                Env: {errorLog.environment}
              </Badge>
            )}
          </div>
          <div className="max-h-[300px] w-full bg-slate-950 p-4 overflow-auto">
            <pre className="text-blue-300 text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(errorLog.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Raw Details */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="bg-muted px-4 py-3 border-b flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="font-medium text-sm">Raw Stack Trace</span>
        </div>
        <div className="h-[400px] w-full bg-slate-950 p-4 overflow-auto">
          <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap">
            {errorLog.stackTrace || "No stack trace available."}
          </pre>
        </div>
      </div>

    </div>
  );
}
