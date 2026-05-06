"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("App route error boundary caught:", error);

  return (
    <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm">
        We hit an unexpected error while loading this page.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
