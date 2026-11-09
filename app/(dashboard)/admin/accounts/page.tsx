import { Suspense } from "react";
import { AccountsClient } from "../_components/AccountsClient";

export default function AdminAccountsPage() {
  return <Suspense fallback={null}><AccountsClient /></Suspense>;
}
