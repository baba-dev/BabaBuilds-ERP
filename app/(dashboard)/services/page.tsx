import type { Metadata } from "next";
import { ServiceCatalog } from "./_components/ServiceCatalog";

export const metadata: Metadata = { title: "Service catalogue" };

export default function ServiceCatalogPage() {
  return <ServiceCatalog />;
}
