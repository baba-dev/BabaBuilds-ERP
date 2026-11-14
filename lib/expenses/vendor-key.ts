/** Same key the database backfill used: lower case, with spaces and . , - & removed. "Acme Co." and "ACME CO" match. */
export const vendorKey = (name: string | null | undefined) => (name ?? "").toLowerCase().trim().replace(/[\s.,\-&]/g, "");
