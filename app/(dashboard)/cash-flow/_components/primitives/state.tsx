import Link from "next/link";
import { AlertTriangle, Inbox, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CashFlowStateProps = {
  title: string;
  description?: string;
  icon?: "empty" | "error" | "setup" | "stale";
  className?: string;
  actions?: React.ReactNode;
};

export function CashFlowState({
  title,
  description,
  icon = "empty",
  className,
  actions,
}: CashFlowStateProps) {
  const iconNode =
    icon === "error" ? (
      <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
    ) : icon === "setup" ? (
      <Sparkles className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
    ) : icon === "stale" ? (
      <RotateCw className="h-6 w-6 text-amber-600 dark:text-amber-400" />
    ) : (
      <Inbox className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />
    );

  const iconWrapClass =
    icon === "error"
      ? "bg-rose-100 dark:bg-rose-900/25"
      : icon === "setup"
        ? "bg-indigo-100 dark:bg-indigo-900/25"
        : icon === "stale"
          ? "bg-amber-100 dark:bg-amber-900/25"
          : "bg-zinc-100 dark:bg-zinc-800";

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/40 dark:bg-zinc-900/20 px-6 py-10 text-center shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <div className={cn("mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl shadow-inner", iconWrapClass)}>
        {iconNode}
      </div>
      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CashFlowErrorState(props: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <CashFlowState
      icon="error"
      title={props.title ?? "Unable to load cash flow"}
      description={props.description ?? "We couldn’t load this view right now. Please retry."}
      actions={
        props.onRetry ? (
          <Button variant="outline" size="sm" onClick={props.onRetry} className="gap-2">
            <RotateCw className="h-4 w-4" />
            Retry
          </Button>
        ) : null
      }
    />
  );
}

export function CashFlowNoSnapshotState(props: { onGenerate?: () => void }) {
  return (
    <CashFlowState
      icon="setup"
      title="No forecast snapshot yet"
      description="Generate your first snapshot to unlock runway, drivers, alerts, and drilldowns."
      actions={
        <>
          {props.onGenerate ? (
            <Button size="sm" onClick={props.onGenerate} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Generate forecast
            </Button>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <Link href="/cash-flow/assumptions">Tune assumptions</Link>
          </Button>
        </>
      }
    />
  );
}

