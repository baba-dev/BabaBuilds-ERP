import type { Metadata } from "next";
import { Suspense } from "react";
import { RetainersWorkspace } from "./_components/RetainersWorkspace";

export const metadata: Metadata = { title: "Retainers" };

export default function RetainersPage() {
  // useSearchParams (URL-backed filters) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <RetainersWorkspace />
    </Suspense>
  );
}
