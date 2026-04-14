import { redirect } from "next/navigation";

// Public alias to the in-app help hub.
// The actual hub UI lives under the authenticated dashboard shell, but the
// content it links to is public (/help/*).
export default function HelpHubAliasPage() {
  redirect("/login?callbackUrl=/help-hub");
}

