/** Minimal typings for the Razorpay Checkout script loaded at runtime. */
interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error: { description: string; code?: string; reason?: string };
}

interface RazorpayCheckoutInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: RazorpayFailureResponse) => void): void;
}

interface Window {
  Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckoutInstance;
}
