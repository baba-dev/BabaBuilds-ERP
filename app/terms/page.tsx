import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1 className="text-3xl font-black tracking-tight">Terms of Service</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        These terms govern your use of BabaBuilds ERP subscriptions and billing services.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Subscription billing terms</h2>
        <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Billing cycle: subscriptions are offered on monthly, quarterly, or yearly cycles.</li>
          <li>Renewal: paid plans auto-renew at the end of each active billing cycle until canceled.</li>
          <li>Cancellation timing: cancellations take effect at the end of the current paid cycle.</li>
          <li>Refunds: charges are generally non-refundable except where required by law or explicit written approval.</li>
          <li>Tax treatment: taxes are charged where applicable based on your billing profile and jurisdiction.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Support path</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Contact support via email at <a className="font-semibold underline" href="mailto:support@bababuilds.com">support@bababuilds.com</a>{" "}
          or through the Help Center contact workflow. Initial response target is within 1 business day.
        </p>
      </section>

      <p className="text-xs text-zinc-500">
        For data handling details, review our <Link className="underline" href="/privacy">Privacy Policy</Link>. For payment policy details, review{" "}
        <Link className="underline" href="/refund-cancellation">Refund & Cancellation Policy</Link>.
      </p>
    </main>
  );
}
