import { redirect } from "next/navigation";

/** The tax hub moved into CA Compliance: one calendar, one readiness view, one place to work with your accountant. */
export default function TaxHubPage() {
  redirect("/ca-portal");
}
