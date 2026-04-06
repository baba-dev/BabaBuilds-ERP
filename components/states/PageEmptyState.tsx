import { Inbox } from "lucide-react";

type PageEmptyStateProps = {
  title?: string;
  description?: string;
  className?: string;
};

export function PageEmptyState({
  title = "No records yet",
  description = "Once activity arrives, this section will populate automatically.",
  className = "min-h-[220px]",
}: PageEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${className}`}>
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4 shadow-inner">
        <Inbox className="w-7 h-7 text-zinc-500 dark:text-zinc-400" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-700 dark:text-zinc-200">{title}</h3>
      <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-md">{description}</p>
    </div>
  );
}
