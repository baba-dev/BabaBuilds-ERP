import { redirect } from "next/navigation";

/** The detail view now lives in the /proposals drawer; old links (income origin, retainers, bookmarks) keep working. */
export default async function ProposalDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/proposals?proposal=${encodeURIComponent(id)}`);
}
