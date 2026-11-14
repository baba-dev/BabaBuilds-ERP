import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to request deletion of your BabaBuilds ERP account and workspace data, what is deleted, and what we must retain.",
  alternates: { canonical: "/delete-account" },
};

const deleted = [
  "Your sign-in identity (name, email address, linked Google account) and profile settings.",
  "Workspace content you created: clients, proposals, invoices, expenses, documents, inventory, reports and preferences, once any legal retention period has passed.",
  "Push-notification subscriptions and registered devices.",
];

const retained = [
  "Tax, accounting and invoice records that we are required to keep by law (for example GST/VAT invoice and ledger records), for the statutory period.",
  "Security, fraud-prevention and audit logs needed to protect the service.",
  "Payment and billing records held by payment processors (Stripe, Razorpay) under their own retention rules.",
  "Backups, which are overwritten on their normal rotation schedule.",
];

/**
 * Public account-deletion information page. Google Play's User Data policy requires a web URL
 * (separate from the app) that explains how to request account and data deletion.
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 pb-safe sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Delete your BabaBuilds ERP account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          App: <strong>BabaBuilds ERP</strong> (web and Android app) · Developer: BabaBuilds
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">How to request deletion</h2>
        <ol className="list-decimal space-y-2 ps-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            Email{" "}
            <a className="font-semibold underline" href="mailto:admin@bababuilds.com?subject=Account%20deletion%20request">
              admin@bababuilds.com
            </a>{" "}
            from the address you sign in with, with the subject <em>“Account deletion request”</em>.
          </li>
          <li>Include your account email and workspace name, and say whether you want only your user account or the whole workspace deleted.</li>
          <li>We confirm the request with you, then complete deletion within 30 days and tell you when it is done.</li>
        </ol>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          If you are the only owner of a workspace, deleting your account deletes the workspace too. Export anything you need first
          from the app (invoices, reports, CSV exports).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">What is deleted</h2>
        <ul className="list-disc space-y-2 ps-5 text-sm text-zinc-700 dark:text-zinc-300">
          {deleted.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">What we may keep, and why</h2>
        <ul className="list-disc space-y-2 ps-5 text-sm text-zinc-700 dark:text-zinc-300">
          {retained.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        See also our{" "}
        <Link className="font-semibold underline" href="/privacy">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link className="font-semibold underline" href="/terms">
          Terms
        </Link>
        .
      </p>
    </main>
  );
}
