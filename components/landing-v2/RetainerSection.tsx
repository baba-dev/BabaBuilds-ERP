export default function RetainerSection() {
  const items = ["Month names", "Billing periods", "Recurring scope", "Tax labels", "Payment reminders"];
  return (
    <section className="rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">Retainers without month-end copy/paste</h2>
      <p className="mt-2 text-sm text-muted-body sm:text-base">Set it once, then generate monthly retainer invoices with the right context every cycle.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium text-foreground">{item}</div>
        ))}
      </div>
    </section>
  );
}
