import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Access denied</h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        Your role does not include permission to open this page. Ask a workspace owner or admin
        to update your access if you need it.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
