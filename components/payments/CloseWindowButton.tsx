"use client";

import Link from "next/link";

type CloseWindowButtonProps = {
  fallbackHref?: string;
  fallbackLabel?: string;
};

export function CloseWindowButton({
  fallbackHref = "/",
  fallbackLabel = "Go to home",
}: CloseWindowButtonProps) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => window.close()}
        className="w-full py-3 px-4 rounded-xl font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-white transition-colors"
      >
        Close Window
      </button>
      <Link
        href={fallbackHref}
        className="block w-full py-3 px-4 rounded-xl font-medium border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
      >
        {fallbackLabel}
      </Link>
    </div>
  );
}
