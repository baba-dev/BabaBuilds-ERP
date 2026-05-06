"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("Global app error boundary caught:", error);

  return (
    <html>
      <body>
        <main className="mx-auto mt-12 max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
          <h1 className="text-lg font-semibold">Application error</h1>
          <p className="mt-2 text-sm">
            A critical error occurred. Please retry, and contact support if this continues.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            Reload app
          </button>
        </main>
      </body>
    </html>
  );
}
