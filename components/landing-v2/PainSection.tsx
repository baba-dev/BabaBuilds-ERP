export default function PainSection() {
  const pains = [
    "Proposals approved on WhatsApp but billing gets delayed.",
    "Retainer invoices are manually copied every month.",
    "Payments arrive but are hard to match.",
    "Expenses are scattered.",
    "CA/audit time becomes a document hunt.",
  ];

  return (
    <section className="rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">Where service teams lose time</h2>
      <ul className="mt-5 space-y-3 text-sm text-muted-body sm:text-base">
        {pains.map((pain) => (
          <li key={pain} className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">{pain}</li>
        ))}
      </ul>
    </section>
  );
}
