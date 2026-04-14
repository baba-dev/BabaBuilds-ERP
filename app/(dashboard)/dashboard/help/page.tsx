import type { Metadata } from "next";
import { getAllDocs, getFeaturedDocs, groupDocsByCategory } from "@/lib/docs";
import { InAppHelpHubClient } from "./InAppHelpHubClient";

export const metadata: Metadata = {
  title: "Help — BabaBuilds ERP",
  robots: {
    index: false,
    follow: false,
  },
};

export default function InAppHelpHubPage() {
  const docs = getAllDocs();
  const featured = getFeaturedDocs(docs, 9);
  const groups = groupDocsByCategory(docs);

  return <InAppHelpHubClient docs={docs} featured={featured} groups={groups} />;
}

