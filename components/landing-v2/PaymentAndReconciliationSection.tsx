export default function PaymentAndReconciliationSection() {
  return (
    <section className="rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">Collect faster, match faster</h2>
      <p className="mt-2 text-sm text-muted-body sm:text-base">
        Send Razorpay or Stripe payment links from invoices, then match incoming transactions with bank records in the same workspace.
      </p>
    </section>
  );
}
