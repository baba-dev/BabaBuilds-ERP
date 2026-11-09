import { Suspense } from "react";
import { LogsClient } from "../_components/LogsClient";

export default function AdminLogsPage() {
  return <Suspense fallback={null}><LogsClient /></Suspense>;
}
