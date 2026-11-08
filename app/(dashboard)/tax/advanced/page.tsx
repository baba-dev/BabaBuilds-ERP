import { redirect } from "next/navigation";

/** Tax Advanced's obligations and readiness now live in CA Compliance. */
export default function TaxAdvancedPage() {
  redirect("/ca-portal");
}
