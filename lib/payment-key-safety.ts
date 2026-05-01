export function isProductionSecurityMode() {
  return process.env.ERP_SECURITY_MODE === "PRODUCTION" || process.env.NODE_ENV === "production";
}

export function isTestStripeSecretKey(key: string) {
  return key.startsWith("sk_test_");
}

export function isTestStripePublishableKey(key: string) {
  return key.startsWith("pk_test_");
}

export function isTestRazorpayKeyId(key: string) {
  return key.startsWith("rzp_test_");
}

export function isTestRazorpaySecretKey(key: string) {
  return key.startsWith("test_");
}
