import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type PageErrorStateProps = {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
};

export function PageErrorState({
  title = "We hit a sync issue",
  description = "We couldn’t load this view right now. Please retry.",
  retryLabel = "Retry",
  onRetry,
  className = "min-h-[280px]",
}: PageErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center mb-4 shadow-inner">
        <AlertTriangle className="w-7 h-7 text-rose-600 dark:text-rose-400" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-800 dark:text-zinc-100">{title}</h3>
      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-md">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw className="w-4 h-4 mr-2" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
