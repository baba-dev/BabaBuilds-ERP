import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline Mode - BabaBuilds ERP",
  description: "Offline fallback screen shown when BabaBuilds ERP cannot reach the network.",
  alternates: {
    canonical: "https://erp.bababuilds.com/offline",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <section className="max-w-lg w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">You are offline</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          BabaBuilds ERP will continue to show cached pages. Reconnect to sync the latest invoices, clients, and tax data.
        </p>
      </section>
    </main>
  );
}
