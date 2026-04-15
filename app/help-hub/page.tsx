import { getAllDocs, getFeaturedDocs, groupDocsByCategory } from "@/lib/docs";
import { InAppHelpHubClient } from "../(dashboard)/dashboard/help/InAppHelpHubClient";

// Public, shareable Help Hub that links to public `/help/*` articles.
export default function HelpHubPublicPage() {
  const docs = getAllDocs();
  const featured = getFeaturedDocs(docs, 9);
  const groups = groupDocsByCategory(docs);

  return <InAppHelpHubClient docs={docs} featured={featured} groups={groups} />;
}

