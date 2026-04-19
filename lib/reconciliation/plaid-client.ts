import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export function getPlaidClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  const env =
    process.env.PLAID_ENV === "production"
      ? PlaidEnvironments.production
      : PlaidEnvironments.sandbox;

  if (!clientId || !secret) return null;

  const config = new Configuration({
    basePath: env,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(config);
}
