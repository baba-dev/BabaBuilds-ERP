import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center dark:bg-zinc-950">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Page not found</h1>
      <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        The page you requested does not exist.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        Go home
      </Link>
    </div>
  );
}
