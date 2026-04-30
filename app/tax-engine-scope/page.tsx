import Link from "next/link";

export default function TaxEngineScopePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-6">
      <h1 className="text-3xl font-black tracking-tight">Tax Engine Scope Disclaimer</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        BabaBuilds ERP provides automated tax estimates and workflow assistance. The tax engine is an operational aid and does not replace
        professional legal, accounting, or filing advice.
      </p>
      <ul className="list-disc pl-6 text-sm space-y-2 text-zinc-700 dark:text-zinc-300">
        <li>Coverage depends on enabled country packs, data completeness, and configured overrides.</li>
        <li>Final filing outcomes may differ due to local regulations, rate updates, or authority interpretation.</li>
        <li>Users are responsible for validating filing outputs before submission to tax authorities.</li>
      </ul>
      <p className="text-xs text-zinc-500">
        See <Link href="/terms" className="underline">Terms</Link> and <Link href="/help" className="underline">Help Center</Link> for related policy references.
      </p>
    </main>
  );
}
