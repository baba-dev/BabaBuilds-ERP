import Link from "next/link";

export default function RefundCancellationPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1 className="text-3xl font-black tracking-tight">Refund & Cancellation Policy</h1>
      <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Subscriptions renew automatically based on the selected billing cycle.</li>
        <li>You can cancel at any time from settings; access remains active until cycle end.</li>
        <li>No partial-cycle refunds unless required by local law or explicitly approved by BabaBuilds.</li>
        <li>Taxes charged by law are included on invoices and generally non-refundable once remitted.</li>
      </ul>
      <section className="space-y-2">
        <h2 className="text-xl font-bold">Need billing help?</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Email <a href="mailto:support@bababuilds.com" className="underline font-semibold">support@bababuilds.com</a> with invoice ID and workspace details.
          Our billing team targets a first response within 1 business day.
        </p>
      </section>
      <p className="text-xs text-zinc-500">
        Related: <Link href="/terms" className="underline">Terms of Service</Link> ·{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </main>
  );
}
