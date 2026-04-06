import { Activity } from "lucide-react";

type PageLoadingStateProps = {
  title?: string;
  description?: string;
  className?: string;
};

export function PageLoadingState({
  title = "Loading your workspace",
  description = "Syncing your latest data…",
  className = "min-h-[280px]",
}: PageLoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4 shadow-inner">
        <Activity className="w-7 h-7 text-indigo-600 dark:text-indigo-400 animate-pulse" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-800 dark:text-zinc-100">{title}</h3>
      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-md">{description}</p>
    </div>
  );
}
