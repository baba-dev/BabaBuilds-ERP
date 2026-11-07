import type { Metadata } from "next";
import { Suspense } from "react";
import { IncomeWorkspace } from "./_components/IncomeWorkspace";

export const metadata: Metadata = { title: "Invoices & earnings" };

export default function InvoicesAndEarningsPage() {
  // useSearchParams (URL-backed filters) requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <IncomeWorkspace />
    </Suspense>
  );
}
