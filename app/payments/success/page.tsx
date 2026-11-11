import { CheckCircle2 } from "lucide-react";
import { CloseWindowButton } from "@/components/payments/CloseWindowButton";

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-xl p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Payment Successful
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Thank you! Your payment has been securely verified and applied to your invoice. You may now safely close this window.
          </p>
        </div>
        <div className="pt-4">
          <CloseWindowButton />
        </div>
      </div>
    </div>
  );
}
