import type { Metadata } from "next";
import { Suspense } from "react";
import { ProposalsWorkspace } from "./_components/ProposalsWorkspace";

export const metadata: Metadata = { title: "Proposals" };

export default function ProposalsPage() {
  // useSearchParams (URL-backed filters) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ProposalsWorkspace />
    </Suspense>
  );
}
