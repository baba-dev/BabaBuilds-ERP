export default function WorkflowSection() {
  const steps = ["Proposal", "E-signature", "Invoice", "Payment Link", "Bank Match", "CA Export"];
  return (
    <section className="rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">One workflow from sale to books</h2>
      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-semibold sm:text-base">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center gap-2">
            <span className="rounded-lg border border-border bg-background px-3 py-2">{step}</span>
            {idx < steps.length - 1 && <span className="text-muted-body">→</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
