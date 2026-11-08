import { Skeleton } from "@/components/ui/skeleton";

export default function CaLoading() {
  return (
    <div className="space-y-5 p-4 sm:p-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-10 w-56 rounded-xl" />
      <Skeleton className="h-12 rounded-2xl" />
      <Skeleton className="h-52 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
    </div>
  );
}
