import { XCircle } from "lucide-react";
import Link from "next/link";

export default function PaymentFailurePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-600 dark:text-red-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Verification Unavailable
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            We couldn't immediately verify your payment right now. Don't worry if your account was charged, our automated systems will synchronize the invoice automatically.
          </p>
        </div>
        <div className="pt-4">
          <button 
            onClick={() => window.close()}
            className="w-full py-3 px-4 rounded-xl font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-white transition-colors"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
