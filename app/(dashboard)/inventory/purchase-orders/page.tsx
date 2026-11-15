import { redirect } from "next/navigation";

/** Purchase orders now live inside the inventory workspace. */
export default function PurchaseOrdersRedirect() {
  redirect("/inventory?tab=orders");
}
