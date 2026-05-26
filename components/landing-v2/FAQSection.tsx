export default function FAQSection() {
  const faqs = [
    ["Is there a free plan?", "Yes. BabaBuilds ERP includes a free plan, with paid plans for higher usage and advanced needs."],
    ["Can I use it for retainers?", "Yes. You can run recurring retainer billing with billing periods and reminders."],
    ["Does it support payment links?", "Yes. You can use payment links through supported gateways from invoice workflows."],
    ["Can my CA access records?", "Yes. You can share controlled access and export records for accountant workflows."],
    ["Is this for agencies or normal businesses?", "Both. It is built for agencies, freelancers, and service businesses."],
    ["Can I export data?", "Yes. You can export financial records for bookkeeping, compliance, and audit preparation."],
  ];
  return (
    <section className="px-6">
      <div className="mx-auto max-w-7xl rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">FAQs</h2>
      <div className="mt-5 space-y-3">
        {faqs.map(([q, a]) => (
          <article key={q} className="rounded-xl border border-border bg-background px-4 py-4">
            <h3 className="text-sm font-semibold text-foreground sm:text-base">{q}</h3>
            <p className="mt-2 text-sm text-muted-body">{a}</p>
          </article>
        ))}
      </div>
      </div>
    </section>
  );
}
