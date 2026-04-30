import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-8">
      <h1 className="text-3xl font-black tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        BabaBuilds ERP collects account, billing, and operational usage information required to deliver the service.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>We process personal data to provide product functionality, billing, support, and security operations.</li>
        <li>We retain financial records and audit trails based on legal and compliance obligations.</li>
        <li>Payment processors may independently process billing metadata for fraud prevention and settlement.</li>
        <li>Support requests can be reviewed to resolve technical or billing incidents.</li>
      </ul>
      <p className="text-xs text-zinc-500">
        Also review our <Link href="/terms" className="underline">Terms of Service</Link> and{" "}
        <Link href="/refund-cancellation" className="underline">Refund & Cancellation Policy</Link>.
      </p>
    </main>
  );
}
