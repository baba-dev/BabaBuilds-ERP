import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function FinalCTA() {
  return (
    <section className="rounded-3xl border border-border bg-foreground px-6 py-10 text-white sm:px-8">
      <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to run proposal to payment in one workflow?</h2>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="rounded-xl" data-cta="final-demo" data-surface="home-v2-final">
          <Link href="/login">Try Live Demo</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10" data-cta="final-start-free" data-surface="home-v2-final">
          <Link href="/signup">Start Free</Link>
        </Button>
      </div>
    </section>
  );
}
