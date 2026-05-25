export default function AIQuestionsSection() {
  const prompts = [
    "Which clients have overdue invoices?",
    "How much did we spend on ads last quarter?",
    "Which retainers are due this week?",
    "Show expenses without receipts.",
  ];

  return (
    <section className="rounded-3xl border border-border/70 bg-surface-elevated p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold text-foreground sm:text-3xl">Ask BabaBot practical finance questions</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <div key={prompt} className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">{prompt}</div>
        ))}
      </div>
    </section>
  );
}
