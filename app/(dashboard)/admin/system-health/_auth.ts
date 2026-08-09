import { notFound } from "next/navigation";
import { verifySuperAdmin } from "@/app/api/admin/authz";

export async function requireSystemHealthSuperAdmin() {
  try {
    return await verifySuperAdmin();
  } catch {
    // Avoid exposing the existence or contents of the diagnostic console.
    notFound();
  }
}
